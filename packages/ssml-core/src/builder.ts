import type {
  SsmlAttributeValue,
  SsmlAttributes,
  SsmlDocument,
  SsmlElement,
  SsmlElementBase,
  SsmlNode,
} from "./types.ts";
import {
  DEFAULT_SSML_LANGUAGE,
  DEFAULT_SSML_VERSION,
  MSTTS_NAMESPACE,
  MSTTS_TAG_PREFIX,
  SSML_ATTRS,
  SSML_TAGS,
  SYNTHESIS_NAMESPACE,
  XML_NAME_PATTERN,
} from "./constants/ssml.ts";

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function addAttribute(attributes: SsmlAttributes, name: string, value: SsmlAttributeValue | undefined): void {
  if (value !== undefined) {
    attributes[name] = value;
  }
}

function getAttributes(element: SsmlElement): SsmlAttributes {
  const attributes: SsmlAttributes = {
    ...(element.attributes ?? {}),
  };

  switch (element.type) {
    case SSML_TAGS.VOICE:
      addAttribute(attributes, SSML_ATTRS.NAME, element.name);
      addAttribute(attributes, SSML_ATTRS.EFFECT, element.effect);
      break;
    case SSML_TAGS.PROSODY:
      addAttribute(attributes, SSML_ATTRS.RATE, element.rate);
      addAttribute(attributes, SSML_ATTRS.PITCH, element.pitch);
      addAttribute(attributes, SSML_ATTRS.VOLUME, element.volume);
      addAttribute(attributes, SSML_ATTRS.CONTOUR, element.contour);
      addAttribute(attributes, SSML_ATTRS.RANGE, element.range);
      break;
    case SSML_TAGS.BREAK:
      addAttribute(attributes, SSML_ATTRS.TIME, element.time);
      addAttribute(attributes, SSML_ATTRS.STRENGTH, element.strength);
      break;
    case SSML_TAGS.EXPRESS_AS:
    case SSML_TAGS.EXPRESS_AS_CAMEL:
    case SSML_TAGS.MSTTS_EXPRESS_AS:
      addAttribute(attributes, SSML_ATTRS.STYLE, element.style);
      addAttribute(attributes, SSML_ATTRS.STYLE_DEGREE, element.styleDegree);
      addAttribute(attributes, SSML_ATTRS.ROLE, element.role);
      break;
    case SSML_TAGS.SAY_AS:
    case SSML_TAGS.SAY_AS_CAMEL:
      addAttribute(attributes, SSML_ATTRS.INTERPRET_AS, element.interpretAs);
      addAttribute(attributes, SSML_ATTRS.FORMAT, element.format);
      addAttribute(attributes, SSML_ATTRS.DETAIL, element.detail);
      break;
    case SSML_TAGS.PHONEME:
      addAttribute(attributes, SSML_ATTRS.ALPHABET, element.alphabet);
      addAttribute(attributes, SSML_ATTRS.PH, element.ph);
      break;
    case SSML_TAGS.EMPHASIS:
      addAttribute(attributes, SSML_ATTRS.LEVEL, element.level);
      break;
    case SSML_TAGS.AUDIO:
      addAttribute(attributes, SSML_ATTRS.SRC, element.src);
      addAttribute(attributes, SSML_ATTRS.DESC, element.desc);
      addAttribute(attributes, SSML_ATTRS.CLIP_BEGIN, element.clipBegin);
      addAttribute(attributes, SSML_ATTRS.CLIP_END, element.clipEnd);
      addAttribute(attributes, SSML_ATTRS.SPEED, element.speed);
      addAttribute(attributes, SSML_ATTRS.REPEAT_COUNT, element.repeatCount);
      addAttribute(attributes, SSML_ATTRS.REPEAT_DURATION, element.repeatDuration);
      addAttribute(attributes, SSML_ATTRS.SOUND_LEVEL, element.soundLevel);
      break;
    case SSML_TAGS.SUB:
      addAttribute(attributes, SSML_ATTRS.ALIAS, element.alias);
      break;
    case SSML_TAGS.LANG:
      addAttribute(attributes, SSML_ATTRS.XML_LANG, element.lang);
      break;
    case SSML_TAGS.MARK:
      addAttribute(attributes, SSML_ATTRS.NAME, element.name);
      break;
    case SSML_TAGS.BOOKMARK:
      addAttribute(attributes, SSML_ATTRS.MARK, element.mark);
      break;
    case SSML_TAGS.LEXICON:
      addAttribute(attributes, SSML_ATTRS.URI, element.uri);
      break;
    case SSML_TAGS.MSTTS_SILENCE:
    case SSML_TAGS.SILENCE:
      addAttribute(attributes, SSML_ATTRS.TYPE, element.typeValue ?? element.silenceType);
      addAttribute(attributes, SSML_ATTRS.VALUE, element.value);
      break;
    case SSML_TAGS.MSTTS_VISEME:
    case SSML_TAGS.VISEME:
      addAttribute(attributes, SSML_ATTRS.TYPE, element.typeValue ?? element.visemeType);
      break;
    case SSML_TAGS.PARAGRAPH:
    case SSML_TAGS.SENTENCE:
    case SSML_TAGS.WORD:
    case "element":
    case "custom":
      break;
  }

  return attributes;
}

function getTagName(element: SsmlElement): string {
  switch (element.type) {
    case SSML_TAGS.EXPRESS_AS:
    case SSML_TAGS.EXPRESS_AS_CAMEL:
    case SSML_TAGS.MSTTS_EXPRESS_AS:
      return SSML_TAGS.MSTTS_EXPRESS_AS;
    case SSML_TAGS.SAY_AS:
    case SSML_TAGS.SAY_AS_CAMEL:
      return SSML_TAGS.SAY_AS;
    case SSML_TAGS.SILENCE:
    case SSML_TAGS.MSTTS_SILENCE:
      return SSML_TAGS.MSTTS_SILENCE;
    case SSML_TAGS.VISEME:
    case SSML_TAGS.MSTTS_VISEME:
      return SSML_TAGS.MSTTS_VISEME;
    case "element":
    case "custom":
      return element.name;
    default:
      return element.type;
  }
}

function getChildren(element: SsmlElementBase): SsmlNode[] {
  return element.children ?? [];
}

function validateName(name: string, kind: "element" | "attribute"): void {
  if (!XML_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid XML ${kind} name: ${name}`);
  }
}

function serializeAttributes(attributes: SsmlAttributes): string {
  return Object.entries(attributes)
    .map(([name, value]) => {
      validateName(name, "attribute");
      return ` ${name}="${escapeAttribute(String(value))}"`;
    })
    .join("");
}

function serializeNode(node: SsmlNode): string {
  if (typeof node === "string") {
    return escapeText(node);
  }

  if (node.type === "text") {
    return escapeText(node.value);
  }

  const tagName = getTagName(node);
  validateName(tagName, "element");

  const attributes = serializeAttributes(getAttributes(node));
  const children = getChildren(node);
  if (children.length === 0) {
    return `<${tagName}${attributes}/>`;
  }

  return `<${tagName}${attributes}>${children.map(serializeNode).join("")}</${tagName}>`;
}

function usesMsttsNamespace(nodes: SsmlNode[]): boolean {
  return nodes.some((node) => {
    if (typeof node === "string" || node.type === "text") {
      return false;
    }

    const tagName = getTagName(node);
    return tagName.startsWith(MSTTS_TAG_PREFIX) || usesMsttsNamespace(getChildren(node));
  });
}

function serializeDocument(document: SsmlDocument): string {
  const children = document.children ?? (document.content === undefined ? [] : [document.content]);
  const attributes: SsmlAttributes = {
    ...(document.attributes ?? {}),
    [SSML_ATTRS.VERSION]: document.version,
    [SSML_ATTRS.XMLNS]: SYNTHESIS_NAMESPACE,
    [SSML_ATTRS.XML_LANG]: document.lang,
  };

  if (usesMsttsNamespace(children) && attributes[SSML_ATTRS.MSTTS_XMLNS] === undefined) {
    attributes[SSML_ATTRS.MSTTS_XMLNS] = MSTTS_NAMESPACE;
  }

  return `<${SSML_TAGS.SPEAK}${serializeAttributes(attributes)}>${children.map(serializeNode).join("")}</${SSML_TAGS.SPEAK}>`;
}

export function buildSsml(document: SsmlDocument): string;
export function buildSsml(content: string, lang?: string): SsmlDocument;
export function buildSsml(
  documentOrContent: SsmlDocument | string,
  lang: string = DEFAULT_SSML_LANGUAGE,
): string | SsmlDocument {
  if (typeof documentOrContent === "string") {
    return {
      version: DEFAULT_SSML_VERSION,
      lang,
      content: documentOrContent,
    };
  }

  return serializeDocument(documentOrContent);
}
