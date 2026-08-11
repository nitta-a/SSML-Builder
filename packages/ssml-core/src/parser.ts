import type {
  AudioElement,
  BookmarkElement,
  BreakElement,
  CustomElement,
  EmphasisElement,
  ExpressAsElement,
  LangElement,
  LexiconElement,
  MarkElement,
  MsttsSilenceElement,
  MsttsVisemeElement,
  ParagraphElement,
  PhonemeElement,
  ProsodyElement,
  SayAsElement,
  SentenceElement,
  SsmlAttributes,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  SubElement,
  VoiceElement,
  WordElement,
} from "./types.ts";
import { MAX_NESTING_DEPTH, MSTTS_NAMESPACE, SYNTHESIS_NAMESPACE } from "./constants/ssml.ts";

interface XmlElementNode {
  name: string;
  attributes: SsmlAttributes;
  children: XmlNode[];
}

type XmlNode = string | XmlElementNode;

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.getOwnPropertyDescriptor(object, property) !== undefined;
}

function setAttribute(attributes: SsmlAttributes, name: string, value: string): void {
  Object.defineProperty(attributes, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function decodeEntity(entity: string): string {
  const namedValue = hasOwn(XML_ENTITIES, entity) ? XML_ENTITIES[entity] : undefined;
  if (namedValue !== undefined) {
    return namedValue;
  }

  const isHexadecimal = entity.startsWith("#x") || entity.startsWith("#X");
  const isDecimal = entity.startsWith("#");
  if (!isHexadecimal && !isDecimal) {
    throw new Error(`Unknown XML entity: &${entity};`);
  }

  const digits = entity.slice(isHexadecimal ? 2 : 1);
  const codePoint = Number.parseInt(digits, isHexadecimal ? 16 : 10);
  if (
    !digits ||
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    (codePoint < 0x20 && ![9, 10, 13].includes(codePoint))
  ) {
    throw new Error(`Invalid XML character reference: &${entity};`);
  }

  return String.fromCodePoint(codePoint);
}

function decodeXmlEntities(value: string): string {
  let result = "";
  let start = 0;

  while (true) {
    const ampersand = value.indexOf("&", start);
    if (ampersand === -1) {
      return result + value.slice(start);
    }

    result += value.slice(start, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon === -1) {
      throw new Error("Unterminated XML entity reference");
    }

    result += decodeEntity(value.slice(ampersand + 1, semicolon));
    start = semicolon + 1;
  }
}

function isXmlNameStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/.test(value);
}

function isXmlNameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_.:-]/.test(value);
}

function isXmlWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function removeStandardNamespaceAttributes(attributes: SsmlAttributes): void {
  if (attributes.xmlns === SYNTHESIS_NAMESPACE) {
    delete attributes.xmlns;
  }
  if (attributes["xmlns:mstts"] === MSTTS_NAMESPACE) {
    delete attributes["xmlns:mstts"];
  }
}

class XmlParser {
  #index = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): XmlElementNode {
    if (this.source.charCodeAt(0) === 0xfeff) {
      this.#index += 1;
    }

    this.skipMisc();
    if (this.#index >= this.source.length) {
      this.fail("SSML input is empty");
    }
    if (this.source[this.#index] !== "<") {
      this.fail("SSML input must start with an XML element");
    }

    const root = this.parseElement(0);
    this.skipMisc();
    if (this.#index !== this.source.length) {
      this.fail("Unexpected content after the root XML element");
    }
    return root;
  }

  private parseElement(depth: number): XmlElementNode {
    if (depth > MAX_NESTING_DEPTH) {
      this.fail("XML nesting depth exceeds the supported limit");
    }

    this.expect("<");
    if (this.source[this.#index] === "/") {
      this.fail("Unexpected closing XML element");
    }

    const name = this.parseName();
    const { attributes, selfClosing } = this.parseStartTag();
    if (selfClosing) {
      return { name, attributes, children: [] };
    }

    const children: XmlNode[] = [];
    while (this.#index < this.source.length) {
      if (this.source.startsWith("</", this.#index)) {
        this.#index += 2;
        const closingName = this.parseName();
        this.skipWhitespace();
        this.expect(">");
        if (closingName !== name) {
          this.fail(`Mismatched closing element: expected </${name}> but found </${closingName}>`);
        }
        return { name, attributes, children };
      }

      if (this.source.startsWith("<!--", this.#index)) {
        this.skipComment();
        continue;
      }

      if (this.source.startsWith("<![CDATA[", this.#index)) {
        this.appendText(children, this.parseCdata());
        continue;
      }

      if (this.source.startsWith("<?", this.#index)) {
        this.skipProcessingInstruction();
        continue;
      }

      if (this.source.startsWith("<!", this.#index)) {
        this.fail("Unsupported XML declaration inside an element");
      }

      if (this.source[this.#index] === "<") {
        children.push(this.parseElement(depth + 1));
      } else {
        this.appendText(children, this.parseText());
      }
    }

    this.fail(`Unclosed XML element: <${name}>`);
  }

  private parseStartTag(): {
    attributes: SsmlAttributes;
    selfClosing: boolean;
  } {
    const attributes: SsmlAttributes = {};

    while (this.#index < this.source.length) {
      this.skipWhitespace();

      if (this.source.startsWith("/>", this.#index)) {
        this.#index += 2;
        return { attributes, selfClosing: true };
      }
      if (this.source[this.#index] === ">") {
        this.#index += 1;
        return { attributes, selfClosing: false };
      }

      const name = this.parseName();
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();

      const quote = this.source[this.#index];
      if (quote !== '"' && quote !== "'") {
        this.fail(`XML attribute ${name} must use a quoted value`);
      }
      this.#index += 1;

      const valueStart = this.#index;
      while (this.#index < this.source.length && this.source[this.#index] !== quote) {
        if (this.source[this.#index] === "<") {
          this.fail(`Invalid "<" in XML attribute ${name}`);
        }
        this.#index += 1;
      }
      if (this.#index >= this.source.length) {
        this.fail(`Unclosed XML attribute ${name}`);
      }

      const value = decodeXmlEntities(this.source.slice(valueStart, this.#index));
      this.#index += 1;

      if (hasOwn(attributes, name)) {
        this.fail(`Duplicate XML attribute: ${name}`);
      }
      setAttribute(attributes, name, value);
    }

    this.fail("Unclosed XML start tag");
  }

  private parseText(): string {
    const start = this.#index;
    while (this.#index < this.source.length && this.source[this.#index] !== "<") {
      this.#index += 1;
    }

    const value = this.source.slice(start, this.#index);
    if (value.includes("]]>")) {
      this.fail("CDATA termination is not valid in ordinary XML text");
    }
    return decodeXmlEntities(value);
  }

  private parseCdata(): string {
    this.#index += "<![CDATA[".length;
    const end = this.source.indexOf("]]>", this.#index);
    if (end === -1) {
      this.fail("Unclosed XML CDATA section");
    }

    const value = this.source.slice(this.#index, end);
    this.#index = end + 3;
    return value;
  }

  private skipComment(): void {
    this.#index += "<!--".length;
    const end = this.source.indexOf("-->", this.#index);
    if (end === -1) {
      this.fail("Unclosed XML comment");
    }
    if (this.source.slice(this.#index, end).includes("--")) {
      this.fail("XML comments cannot contain consecutive hyphens");
    }
    this.#index = end + 3;
  }

  private skipProcessingInstruction(): void {
    this.#index += "<?".length;
    this.parseName();
    const end = this.source.indexOf("?>", this.#index);
    if (end === -1) {
      this.fail("Unclosed XML processing instruction");
    }
    this.#index = end + 2;
  }

  private skipMisc(): void {
    while (this.#index < this.source.length) {
      this.skipWhitespace();
      if (this.source.startsWith("<!--", this.#index)) {
        this.skipComment();
        continue;
      }
      if (this.source.startsWith("<?", this.#index)) {
        this.skipProcessingInstruction();
        continue;
      }
      if (this.source.startsWith("<!DOCTYPE", this.#index)) {
        this.fail("DOCTYPE declarations are not supported");
      }
      break;
    }
  }

  private parseName(): string {
    const first = this.source[this.#index];
    if (!isXmlNameStart(first)) {
      this.fail("Invalid XML name");
    }

    const start = this.#index;
    this.#index += 1;
    while (isXmlNameCharacter(this.source[this.#index])) {
      this.#index += 1;
    }
    return this.source.slice(start, this.#index);
  }

  private appendText(children: XmlNode[], value: string): void {
    if (!value) {
      return;
    }

    const previous = children[children.length - 1];
    if (typeof previous === "string") {
      children[children.length - 1] = previous + value;
    } else {
      children.push(value);
    }
  }

  private skipWhitespace(): void {
    while (isXmlWhitespace(this.source[this.#index])) {
      this.#index += 1;
    }
  }

  private expect(value: string): void {
    if (!this.source.startsWith(value, this.#index)) {
      this.fail(`Expected "${value}"`);
    }
    this.#index += value.length;
  }

  private fail(message: string): never {
    throw new Error(`${message} at position ${this.#index}`);
  }
}

function readAttribute(attributes: SsmlAttributes, ...names: string[]): string | undefined {
  let found = false;
  let value: string | undefined;

  for (const name of names) {
    if (hasOwn(attributes, name)) {
      if (!found) {
        value = String(attributes[name]);
        found = true;
      }
      delete attributes[name];
    }
  }

  return value;
}

function getElementAttributes(node: XmlElementNode): SsmlAttributes {
  const attributes: SsmlAttributes = { ...node.attributes };
  removeStandardNamespaceAttributes(attributes);
  return attributes;
}

function finishElement<T extends SsmlElement>(element: T, node: XmlElementNode, attributes: SsmlAttributes): T {
  if (node.children.length > 0) {
    element.children = node.children.map(convertNode);
  }
  if (Object.keys(attributes).length > 0) {
    element.attributes = attributes;
  }
  return element;
}

function convertElement(node: XmlElementNode): SsmlElement {
  const attributes = getElementAttributes(node);

  switch (node.name) {
    case "voice": {
      const element: VoiceElement = { type: "voice" };
      const name = readAttribute(attributes, "name");
      const effect = readAttribute(attributes, "effect");
      if (name !== undefined) element.name = name;
      if (effect !== undefined) element.effect = effect;
      return finishElement(element, node, attributes);
    }
    case "prosody": {
      const element: ProsodyElement = { type: "prosody" };
      const rate = readAttribute(attributes, "rate");
      const pitch = readAttribute(attributes, "pitch");
      const volume = readAttribute(attributes, "volume");
      const contour = readAttribute(attributes, "contour");
      const range = readAttribute(attributes, "range");
      if (rate !== undefined) element.rate = rate;
      if (pitch !== undefined) element.pitch = pitch;
      if (volume !== undefined) element.volume = volume;
      if (contour !== undefined) element.contour = contour;
      if (range !== undefined) element.range = range;
      return finishElement(element, node, attributes);
    }
    case "break": {
      const element: BreakElement = { type: "break" };
      const time = readAttribute(attributes, "time");
      const strength = readAttribute(attributes, "strength");
      if (time !== undefined) element.time = time;
      if (strength !== undefined) element.strength = strength;
      return finishElement(element, node, attributes);
    }
    case "express-as":
    case "expressAs":
    case "mstts:express-as": {
      const element: ExpressAsElement = { type: node.name };
      const style = readAttribute(attributes, "style");
      const styleDegree = readAttribute(attributes, "styledegree", "styleDegree");
      const role = readAttribute(attributes, "role");
      if (style !== undefined) element.style = style;
      if (styleDegree !== undefined) element.styleDegree = styleDegree;
      if (role !== undefined) element.role = role;
      return finishElement(element, node, attributes);
    }
    case "say-as":
    case "sayAs": {
      const element: SayAsElement = { type: node.name };
      const interpretAs = readAttribute(attributes, "interpret-as");
      const format = readAttribute(attributes, "format");
      const detail = readAttribute(attributes, "detail");
      if (interpretAs !== undefined) element.interpretAs = interpretAs;
      if (format !== undefined) element.format = format;
      if (detail !== undefined) element.detail = detail;
      return finishElement(element, node, attributes);
    }
    case "phoneme": {
      const element: PhonemeElement = { type: "phoneme" };
      const alphabet = readAttribute(attributes, "alphabet");
      const ph = readAttribute(attributes, "ph");
      if (alphabet !== undefined) element.alphabet = alphabet;
      if (ph !== undefined) element.ph = ph;
      return finishElement(element, node, attributes);
    }
    case "emphasis": {
      const element: EmphasisElement = { type: "emphasis" };
      const level = readAttribute(attributes, "level");
      if (level !== undefined) element.level = level;
      return finishElement(element, node, attributes);
    }
    case "audio": {
      const element: AudioElement = { type: "audio" };
      const src = readAttribute(attributes, "src");
      const desc = readAttribute(attributes, "desc");
      const clipBegin = readAttribute(attributes, "clipBegin");
      const clipEnd = readAttribute(attributes, "clipEnd");
      const speed = readAttribute(attributes, "speed");
      const repeatCount = readAttribute(attributes, "repeatCount");
      const repeatDuration = readAttribute(attributes, "repeatDuration");
      const soundLevel = readAttribute(attributes, "soundLevel");
      if (src !== undefined) element.src = src;
      if (desc !== undefined) element.desc = desc;
      if (clipBegin !== undefined) element.clipBegin = clipBegin;
      if (clipEnd !== undefined) element.clipEnd = clipEnd;
      if (speed !== undefined) element.speed = speed;
      if (repeatCount !== undefined) element.repeatCount = repeatCount;
      if (repeatDuration !== undefined) element.repeatDuration = repeatDuration;
      if (soundLevel !== undefined) element.soundLevel = soundLevel;
      return finishElement(element, node, attributes);
    }
    case "sub": {
      const element: SubElement = { type: "sub" };
      const alias = readAttribute(attributes, "alias");
      if (alias !== undefined) element.alias = alias;
      return finishElement(element, node, attributes);
    }
    case "lang": {
      const element: LangElement = { type: "lang" };
      const lang = readAttribute(attributes, "xml:lang", "lang");
      if (lang !== undefined) element.lang = lang;
      return finishElement(element, node, attributes);
    }
    case "mark": {
      const element: MarkElement = { type: "mark" };
      const name = readAttribute(attributes, "name");
      if (name !== undefined) element.name = name;
      return finishElement(element, node, attributes);
    }
    case "bookmark": {
      const element: BookmarkElement = { type: "bookmark" };
      const mark = readAttribute(attributes, "mark");
      if (mark !== undefined) element.mark = mark;
      return finishElement(element, node, attributes);
    }
    case "lexicon": {
      const element: LexiconElement = { type: "lexicon" };
      const uri = readAttribute(attributes, "uri");
      if (uri !== undefined) element.uri = uri;
      return finishElement(element, node, attributes);
    }
    case "p": {
      const element: ParagraphElement = { type: "p" };
      return finishElement(element, node, attributes);
    }
    case "s": {
      const element: SentenceElement = { type: "s" };
      return finishElement(element, node, attributes);
    }
    case "w": {
      const element: WordElement = { type: "w" };
      return finishElement(element, node, attributes);
    }
    case "mstts:silence":
    case "silence": {
      const element: MsttsSilenceElement = {
        type: node.name === "mstts:silence" ? "mstts:silence" : "silence",
      };
      const typeValue = readAttribute(attributes, "type");
      const value = readAttribute(attributes, "value");
      if (typeValue !== undefined) element.typeValue = typeValue;
      if (value !== undefined) element.value = value;
      return finishElement(element, node, attributes);
    }
    case "mstts:viseme":
    case "viseme": {
      const element: MsttsVisemeElement = {
        type: node.name === "mstts:viseme" ? "mstts:viseme" : "viseme",
      };
      const typeValue = readAttribute(attributes, "type");
      if (typeValue !== undefined) element.typeValue = typeValue;
      return finishElement(element, node, attributes);
    }
    default: {
      const element: CustomElement = {
        name: node.name,
        type: "custom",
      };
      return finishElement(element, node, attributes);
    }
  }
}

function convertNode(node: XmlNode): SsmlNode {
  return typeof node === "string" ? node : convertElement(node);
}

export function parseSsml(xmlString: string): SsmlDocument {
  if (typeof xmlString !== "string") {
    throw new TypeError("SSML input must be a string");
  }

  const root = new XmlParser(xmlString).parse();
  if (root.name !== "speak") {
    throw new Error(`SSML root element must be <speak>, found <${root.name}>`);
  }

  const attributes: SsmlAttributes = { ...root.attributes };
  const version = readAttribute(attributes, "version");
  const lang = readAttribute(attributes, "xml:lang", "lang");
  if (version === undefined) {
    throw new Error('SSML <speak> element is missing the "version" attribute');
  }
  if (lang === undefined) {
    throw new Error('SSML <speak> element is missing the "xml:lang" attribute');
  }

  removeStandardNamespaceAttributes(attributes);
  const document: SsmlDocument = {
    children: root.children.map(convertNode),
    lang,
    type: "speak",
    version,
  };
  if (Object.keys(attributes).length > 0) {
    document.attributes = attributes;
  }
  return document;
}
