import type {
  SsmlAttributeValue,
  SsmlAttributes,
  SsmlDocument,
  SsmlElement,
  SsmlElementBase,
  SsmlNode,
} from "./types.ts";

const SYNTHESIS_NAMESPACE = "http://www.w3.org/2001/10/synthesis";
const MSTTS_NAMESPACE = "https://www.w3.org/2001/mstts";
const XML_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function addAttribute(
  attributes: SsmlAttributes,
  name: string,
  value: SsmlAttributeValue | undefined,
): void {
  if (value !== undefined) {
    attributes[name] = value;
  }
}

function getAttributes(element: SsmlElement): SsmlAttributes {
  const attributes: SsmlAttributes = {
    ...(element.attributes ?? {}),
    ...(element.attrs ?? {}),
  };

  switch (element.type) {
    case "voice":
      addAttribute(attributes, "name", element.name);
      addAttribute(attributes, "effect", element.effect);
      break;
    case "prosody":
      addAttribute(attributes, "rate", element.rate);
      addAttribute(attributes, "pitch", element.pitch);
      addAttribute(attributes, "volume", element.volume);
      addAttribute(attributes, "contour", element.contour);
      addAttribute(attributes, "range", element.range);
      break;
    case "break":
      addAttribute(attributes, "time", element.time);
      addAttribute(attributes, "strength", element.strength);
      break;
    case "express-as":
    case "expressAs":
    case "mstts:express-as":
      addAttribute(attributes, "style", element.style);
      addAttribute(
        attributes,
        "styledegree",
        element.styleDegree ?? element.styledegree,
      );
      addAttribute(attributes, "role", element.role);
      break;
    case "say-as":
    case "sayAs":
      addAttribute(
        attributes,
        "interpret-as",
        element.interpretAs ?? element["interpret-as"],
      );
      addAttribute(attributes, "format", element.format);
      addAttribute(attributes, "detail", element.detail);
      break;
    case "phoneme":
      addAttribute(attributes, "alphabet", element.alphabet);
      addAttribute(attributes, "ph", element.ph);
      break;
    case "emphasis":
      addAttribute(attributes, "level", element.level);
      break;
    case "audio":
      addAttribute(attributes, "src", element.src);
      addAttribute(attributes, "desc", element.desc);
      addAttribute(attributes, "clipBegin", element.clipBegin);
      addAttribute(attributes, "clipEnd", element.clipEnd);
      addAttribute(attributes, "speed", element.speed);
      addAttribute(attributes, "repeatCount", element.repeatCount);
      addAttribute(attributes, "repeatDuration", element.repeatDuration);
      addAttribute(attributes, "soundLevel", element.soundLevel);
      break;
    case "sub":
      addAttribute(attributes, "alias", element.alias);
      break;
    case "lang":
      addAttribute(attributes, "xml:lang", element.lang);
      break;
    case "mark":
      addAttribute(attributes, "name", element.name);
      break;
    case "bookmark":
      addAttribute(attributes, "mark", element.mark);
      break;
    case "lexicon":
      addAttribute(attributes, "uri", element.uri);
      break;
    case "mstts:silence":
    case "silence":
      addAttribute(
        attributes,
        "type",
        element.typeValue ?? element.silenceType,
      );
      addAttribute(attributes, "value", element.value);
      break;
    case "mstts:viseme":
    case "viseme":
      addAttribute(attributes, "type", element.typeValue ?? element.visemeType);
      break;
    case "p":
    case "s":
    case "w":
    case "element":
    case "custom":
      break;
  }

  return attributes;
}

function getTagName(element: SsmlElement): string {
  switch (element.type) {
    case "express-as":
    case "expressAs":
    case "mstts:express-as":
      return "mstts:express-as";
    case "silence":
    case "mstts:silence":
      return "mstts:silence";
    case "viseme":
    case "mstts:viseme":
      return "mstts:viseme";
    case "element":
    case "custom":
      return element.name;
    default:
      return element.type;
  }
}

function getChildren(element: SsmlElementBase): SsmlNode[] {
  if (element.children !== undefined) {
    return element.children;
  }

  if (Array.isArray(element.content)) {
    return element.content;
  }

  if (typeof element.content === "string") {
    return [element.content];
  }

  return [];
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

  return `<${tagName}${attributes}>${children
    .map(serializeNode)
    .join("")}</${tagName}>`;
}

function usesMsttsNamespace(nodes: SsmlNode[]): boolean {
  return nodes.some((node) => {
    if (typeof node === "string" || node.type === "text") {
      return false;
    }

    const tagName = getTagName(node);
    return (
      tagName.startsWith("mstts:") || usesMsttsNamespace(getChildren(node))
    );
  });
}

function serializeDocument(document: SsmlDocument): string {
  const children =
    document.children ??
    (document.content === undefined ? [] : [document.content]);
  const attributes: SsmlAttributes = {
    ...(document.attributes ?? {}),
    version: document.version,
    xmlns: SYNTHESIS_NAMESPACE,
    "xml:lang": document.lang,
  };

  if (usesMsttsNamespace(children) && attributes["xmlns:mstts"] === undefined) {
    attributes["xmlns:mstts"] = MSTTS_NAMESPACE;
  }

  return `<speak${serializeAttributes(attributes)}>${children
    .map(serializeNode)
    .join("")}</speak>`;
}

export function buildSsml(document: SsmlDocument): string;
export function buildSsml(content: string, lang?: string): SsmlDocument;
export function buildSsml(
  documentOrContent: SsmlDocument | string,
  lang = "en-US",
): string | SsmlDocument {
  if (typeof documentOrContent === "string") {
    return {
      version: "1.0",
      lang,
      content: documentOrContent,
    };
  }

  return serializeDocument(documentOrContent);
}
