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
import { MAX_NESTING_DEPTH, MSTTS_NAMESPACE, SSML_ATTRS, SSML_TAGS, SYNTHESIS_NAMESPACE } from "./constants/ssml.ts";

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
  if (attributes[SSML_ATTRS.XMLNS] === SYNTHESIS_NAMESPACE) {
    delete attributes[SSML_ATTRS.XMLNS];
  }
  if (attributes[SSML_ATTRS.MSTTS_XMLNS] === MSTTS_NAMESPACE) {
    delete attributes[SSML_ATTRS.MSTTS_XMLNS];
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
    case SSML_TAGS.VOICE: {
      const element: VoiceElement = { type: SSML_TAGS.VOICE };
      const name = readAttribute(attributes, SSML_ATTRS.NAME);
      const effect = readAttribute(attributes, SSML_ATTRS.EFFECT);
      if (name !== undefined) element.name = name;
      if (effect !== undefined) element.effect = effect;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.PROSODY: {
      const element: ProsodyElement = { type: SSML_TAGS.PROSODY };
      const rate = readAttribute(attributes, SSML_ATTRS.RATE);
      const pitch = readAttribute(attributes, SSML_ATTRS.PITCH);
      const volume = readAttribute(attributes, SSML_ATTRS.VOLUME);
      const contour = readAttribute(attributes, SSML_ATTRS.CONTOUR);
      const range = readAttribute(attributes, SSML_ATTRS.RANGE);
      if (rate !== undefined) element.rate = rate;
      if (pitch !== undefined) element.pitch = pitch;
      if (volume !== undefined) element.volume = volume;
      if (contour !== undefined) element.contour = contour;
      if (range !== undefined) element.range = range;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.BREAK: {
      const element: BreakElement = { type: SSML_TAGS.BREAK };
      const time = readAttribute(attributes, SSML_ATTRS.TIME);
      const strength = readAttribute(attributes, SSML_ATTRS.STRENGTH);
      if (time !== undefined) element.time = time;
      if (strength !== undefined) element.strength = strength;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.EXPRESS_AS:
    case SSML_TAGS.EXPRESS_AS_CAMEL:
    case SSML_TAGS.MSTTS_EXPRESS_AS: {
      const element: ExpressAsElement = { type: node.name };
      const style = readAttribute(attributes, SSML_ATTRS.STYLE);
      const styleDegree = readAttribute(attributes, SSML_ATTRS.STYLE_DEGREE, SSML_ATTRS.STYLE_DEGREE_CAMEL);
      const role = readAttribute(attributes, SSML_ATTRS.ROLE);
      if (style !== undefined) element.style = style;
      if (styleDegree !== undefined) element.styleDegree = styleDegree;
      if (role !== undefined) element.role = role;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.SAY_AS:
    case SSML_TAGS.SAY_AS_CAMEL: {
      const element: SayAsElement = { type: node.name };
      const interpretAs = readAttribute(attributes, SSML_ATTRS.INTERPRET_AS);
      const format = readAttribute(attributes, SSML_ATTRS.FORMAT);
      const detail = readAttribute(attributes, SSML_ATTRS.DETAIL);
      if (interpretAs !== undefined) element.interpretAs = interpretAs;
      if (format !== undefined) element.format = format;
      if (detail !== undefined) element.detail = detail;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.PHONEME: {
      const element: PhonemeElement = { type: SSML_TAGS.PHONEME };
      const alphabet = readAttribute(attributes, SSML_ATTRS.ALPHABET);
      const ph = readAttribute(attributes, SSML_ATTRS.PH);
      if (alphabet !== undefined) element.alphabet = alphabet;
      if (ph !== undefined) element.ph = ph;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.EMPHASIS: {
      const element: EmphasisElement = { type: SSML_TAGS.EMPHASIS };
      const level = readAttribute(attributes, SSML_ATTRS.LEVEL);
      if (level !== undefined) element.level = level;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.AUDIO: {
      const element: AudioElement = { type: SSML_TAGS.AUDIO };
      const src = readAttribute(attributes, SSML_ATTRS.SRC);
      const desc = readAttribute(attributes, SSML_ATTRS.DESC);
      const clipBegin = readAttribute(attributes, SSML_ATTRS.CLIP_BEGIN);
      const clipEnd = readAttribute(attributes, SSML_ATTRS.CLIP_END);
      const speed = readAttribute(attributes, SSML_ATTRS.SPEED);
      const repeatCount = readAttribute(attributes, SSML_ATTRS.REPEAT_COUNT);
      const repeatDuration = readAttribute(attributes, SSML_ATTRS.REPEAT_DURATION);
      const soundLevel = readAttribute(attributes, SSML_ATTRS.SOUND_LEVEL);
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
    case SSML_TAGS.SUB: {
      const element: SubElement = { type: SSML_TAGS.SUB };
      const alias = readAttribute(attributes, SSML_ATTRS.ALIAS);
      if (alias !== undefined) element.alias = alias;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.LANG: {
      const element: LangElement = { type: SSML_TAGS.LANG };
      const lang = readAttribute(attributes, SSML_ATTRS.XML_LANG, SSML_ATTRS.LANG);
      if (lang !== undefined) element.lang = lang;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.MARK: {
      const element: MarkElement = { type: SSML_TAGS.MARK };
      const name = readAttribute(attributes, SSML_ATTRS.NAME);
      if (name !== undefined) element.name = name;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.BOOKMARK: {
      const element: BookmarkElement = { type: SSML_TAGS.BOOKMARK };
      const mark = readAttribute(attributes, SSML_ATTRS.MARK);
      if (mark !== undefined) element.mark = mark;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.LEXICON: {
      const element: LexiconElement = { type: SSML_TAGS.LEXICON };
      const uri = readAttribute(attributes, SSML_ATTRS.URI);
      if (uri !== undefined) element.uri = uri;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.PARAGRAPH: {
      const element: ParagraphElement = { type: SSML_TAGS.PARAGRAPH };
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.SENTENCE: {
      const element: SentenceElement = { type: SSML_TAGS.SENTENCE };
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.WORD: {
      const element: WordElement = { type: SSML_TAGS.WORD };
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.MSTTS_SILENCE:
    case SSML_TAGS.SILENCE: {
      const element: MsttsSilenceElement = {
        type: node.name === SSML_TAGS.MSTTS_SILENCE ? SSML_TAGS.MSTTS_SILENCE : SSML_TAGS.SILENCE,
      };
      const typeValue = readAttribute(attributes, SSML_ATTRS.TYPE);
      const value = readAttribute(attributes, SSML_ATTRS.VALUE);
      if (typeValue !== undefined) element.typeValue = typeValue;
      if (value !== undefined) element.value = value;
      return finishElement(element, node, attributes);
    }
    case SSML_TAGS.MSTTS_VISEME:
    case SSML_TAGS.VISEME: {
      const element: MsttsVisemeElement = {
        type: node.name === SSML_TAGS.MSTTS_VISEME ? SSML_TAGS.MSTTS_VISEME : SSML_TAGS.VISEME,
      };
      const typeValue = readAttribute(attributes, SSML_ATTRS.TYPE);
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
  if (root.name !== SSML_TAGS.SPEAK) {
    throw new Error(`SSML root element must be <${SSML_TAGS.SPEAK}>, found <${root.name}>`);
  }

  const attributes: SsmlAttributes = { ...root.attributes };
  const version = readAttribute(attributes, SSML_ATTRS.VERSION);
  const lang = readAttribute(attributes, SSML_ATTRS.XML_LANG, SSML_ATTRS.LANG);
  if (version === undefined) {
    throw new Error(`SSML <${SSML_TAGS.SPEAK}> element is missing the "${SSML_ATTRS.VERSION}" attribute`);
  }
  if (lang === undefined) {
    throw new Error(`SSML <${SSML_TAGS.SPEAK}> element is missing the "${SSML_ATTRS.XML_LANG}" attribute`);
  }

  removeStandardNamespaceAttributes(attributes);
  const document: SsmlDocument = {
    children: root.children.map(convertNode),
    lang,
    type: SSML_TAGS.SPEAK,
    version,
  };
  if (Object.keys(attributes).length > 0) {
    document.attributes = attributes;
  }
  return document;
}
