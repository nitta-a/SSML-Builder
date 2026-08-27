import { parseSsml } from "./parser.ts";
import type { SsmlAttributeValue, SsmlAttributes, SsmlDocument, SsmlElement, SsmlNode } from "./types.ts";
import type { SsmlTextNodeContext } from "./textNodes.ts";

const DEFAULT_TRANSLATION_SKIP_TAGS = ["phoneme", "say-as", "sayAs", "sub"] as const;

export interface ExtractSsmlTranslatableTextOptions {
  /** Element names whose descendants are not translation targets. */
  skipTags?: readonly string[];
  /** Include indentation and whitespace-only text nodes. Defaults to false. */
  includeWhitespace?: boolean;
  /** Further restrict text nodes after the skip-tag check. */
  filter?: (context: SsmlTextNodeContext) => boolean;
}

export interface FromPlainTextToSsmlOptions {
  version?: string;
  lang?: string;
  /** Alias for lang, useful when options come from an application form. */
  language?: string;
  /** Wrap generated paragraphs in a voice element. */
  voice?: string;
  /** Alias for voice. */
  voiceName?: string;
  /** Generate sentence elements inside paragraphs. Defaults to true. */
  includeSentences?: boolean;
  /** Alias for includeSentences. */
  splitSentences?: boolean;
}

export interface SsmlStructureMismatch {
  kind: "element" | "attribute" | "parse";
  path: string;
  original?: string;
  translated?: string;
  message: string;
}

export interface SsmlStructureIntegrityResult {
  isValid: boolean;
  /** Alias for isValid for callers that prefer a shorter result property. */
  valid: boolean;
  errors: string[];
  mismatches: SsmlStructureMismatch[];
  /** Element or attribute names involved in each mismatch. */
  mismatchedTags: string[];
}

function elementName(element: SsmlElement): string {
  switch (element.type) {
    case "custom":
    case "element":
      return element.name;
    case "expressAs":
      return "mstts:express-as";
    case "sayAs":
      return "say-as";
    case "silence":
      return "mstts:silence";
    case "viseme":
      return "mstts:viseme";
    default:
      return element.type;
  }
}

function addAttribute(attributes: SsmlAttributes, name: string, value: SsmlAttributeValue | string | undefined): void {
  if (value !== undefined) attributes[name] = value;
}

function elementAttributes(element: SsmlElement): Record<string, string> {
  const attributes: SsmlAttributes = { ...(element.attributes ?? {}) };
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
      addAttribute(attributes, "styledegree", element.styleDegree);
      addAttribute(attributes, "role", element.role);
      break;
    case "say-as":
    case "sayAs":
      addAttribute(attributes, "interpret-as", element.interpretAs);
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
      addAttribute(attributes, "type", element.typeValue ?? element.silenceType);
      addAttribute(attributes, "value", element.value);
      break;
    case "mstts:viseme":
    case "viseme":
      addAttribute(attributes, "type", element.typeValue ?? element.visemeType);
      break;
    case "mstts:audioduration":
      addAttribute(attributes, "value", element.value);
      break;
    case "mstts:turn":
      addAttribute(attributes, "voice", element.voice);
      break;
    case "mstts:backgroundaudio":
      addAttribute(attributes, "src", element.src);
      addAttribute(attributes, "volume", element.volume);
      addAttribute(attributes, "fadein", element.fadeIn ?? element.fadein);
      addAttribute(attributes, "fadeout", element.fadeOut ?? element.fadeout);
      break;
  }
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, String(value)]));
}

function childrenOf(node: SsmlDocument | SsmlElement): SsmlNode[] {
  return node.children ?? [];
}

export function extractSsmlTranslatableText(ssml: string, options: ExtractSsmlTranslatableTextOptions = {}): string[] {
  const document = parseSsml(ssml);
  const skipTags = new Set((options.skipTags ?? DEFAULT_TRANSLATION_SKIP_TAGS).map((tag) => tag.toLowerCase()));
  const result: string[] = [];

  const visit = (nodes: SsmlNode[], ancestors: string[], path: string[]): void => {
    nodes.forEach((node, index) => {
      if (typeof node === "string") {
        if (options.includeWhitespace || node.trim().length > 0) {
          const context: SsmlTextNodeContext = {
            ancestorTags: [...ancestors],
            parentAttributes: {},
            parentTag: ancestors[ancestors.length - 1] ?? "",
            path: [...path, String(index)],
          };
          if (options.filter?.(context) ?? true) result.push(node);
        }
        return;
      }
      if (node.type === "text") {
        if (options.includeWhitespace || node.value.trim().length > 0) {
          const context: SsmlTextNodeContext = {
            ancestorTags: [...ancestors],
            parentAttributes: {},
            parentTag: ancestors[ancestors.length - 1] ?? "",
            path: [...path, String(index)],
          };
          if (options.filter?.(context) ?? true) result.push(node.value);
        }
        return;
      }

      const tag = elementName(node);
      if (skipTags.has(tag.toLowerCase())) return;
      visit(childrenOf(node), [...ancestors, tag], [...path, String(index)]);
    });
  };

  visit(childrenOf(document), ["speak"], []);
  return result;
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const isTerminator = "。！？!?".includes(character) || (character === "." && /\s|$/.test(text[index + 1] ?? ""));
    if (isTerminator) {
      const value = text.slice(start, index + 1).trim();
      if (value) sentences.push(value);
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

export function fromPlainTextToSsml(text: string, options: FromPlainTextToSsmlOptions = {}): string {
  if (typeof text !== "string") throw new TypeError("Plain text must be a string");
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const useSentences = options.splitSentences ?? options.includeSentences ?? true;
  const paragraphNodes = paragraphs.map((paragraph) => ({
    type: "p" as const,
    children: useSentences
      ? splitSentences(paragraph).map((sentence) => ({ type: "s" as const, children: [sentence] }))
      : [paragraph],
  }));
  const voiceName = options.voice ?? options.voiceName;
  const children: SsmlNode[] = voiceName
    ? [{ type: "voice", name: voiceName, children: paragraphNodes }]
    : paragraphNodes;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializeDocument({
    version: options.version ?? "1.0",
    lang: options.lang ?? options.language ?? "en-US",
    children,
  })}`;
}

function serializeDocument(document: SsmlDocument): string {
  const attributes = [`version="${document.version}"`, `xml:lang="${document.lang}"`];
  const serialize = (node: SsmlNode): string => {
    if (typeof node === "string") return node.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (node.type === "text") return serialize(node.value);
    const tag = elementName(node);
    const nodeAttributes = elementAttributes(node);
    const serializedAttributes = Object.entries(nodeAttributes)
      .map(([name, value]) => ` ${name}="${serialize(value).replace(/"/g, "&quot;")}"`)
      .join("");
    const children = childrenOf(node).map(serialize).join("");
    return children ? `<${tag}${serializedAttributes}>${children}</${tag}>` : `<${tag}${serializedAttributes}/>`;
  };
  return `<speak ${attributes.join(" ")} xmlns="http://www.w3.org/2001/10/synthesis">${(document.children ?? [])
    .map(serialize)
    .join("")}</speak>`;
}

interface FlatElement {
  name: string;
  attributes: Record<string, string>;
  path: string;
}

function flatten(document: SsmlDocument): FlatElement[] {
  const result: FlatElement[] = [];
  const visit = (nodes: SsmlNode[], path: string): void => {
    nodes.forEach((node, index) => {
      if (typeof node === "string" || node.type === "text") return;
      const currentPath = `${path}/${index}`;
      result.push({ name: elementName(node), attributes: elementAttributes(node), path: currentPath });
      visit(childrenOf(node), currentPath);
    });
  };
  result.push({ name: "speak", attributes: { version: document.version, "xml:lang": document.lang }, path: "0" });
  visit(childrenOf(document), "0");
  return result;
}

export function validateSsmlStructureIntegrity(
  originalSsml: string,
  translatedSsml: string,
): SsmlStructureIntegrityResult {
  const mismatches: SsmlStructureMismatch[] = [];
  let original: SsmlDocument;
  let translated: SsmlDocument;
  try {
    original = parseSsml(originalSsml);
  } catch (error) {
    mismatches.push({ kind: "parse", message: `Original SSML cannot be parsed: ${String(error)}`, path: "0" });
    return {
      isValid: false,
      valid: false,
      errors: mismatches.map((item) => item.message),
      mismatches,
      mismatchedTags: [],
    };
  }
  try {
    translated = parseSsml(translatedSsml);
  } catch (error) {
    mismatches.push({ kind: "parse", message: `Translated SSML cannot be parsed: ${String(error)}`, path: "0" });
    return {
      isValid: false,
      valid: false,
      errors: mismatches.map((item) => item.message),
      mismatches,
      mismatchedTags: [],
    };
  }

  const originalElements = flatten(original);
  const translatedElements = flatten(translated);
  const count = Math.max(originalElements.length, translatedElements.length);
  for (let index = 0; index < count; index += 1) {
    const originalElement = originalElements[index];
    const translatedElement = translatedElements[index];
    if (!originalElement || !translatedElement || originalElement.name !== translatedElement.name) {
      mismatches.push({
        kind: "element",
        message: `SSML element structure differs at index ${index}`,
        original: originalElement?.name,
        path: originalElement?.path ?? translatedElement?.path ?? String(index),
        translated: translatedElement?.name,
      });
      continue;
    }
    const attributeNames = new Set([
      ...Object.keys(originalElement.attributes),
      ...Object.keys(translatedElement.attributes),
    ]);
    for (const attribute of attributeNames) {
      if (originalElement.attributes[attribute] !== translatedElement.attributes[attribute]) {
        mismatches.push({
          kind: "attribute",
          message: `Attribute ${attribute} differs on <${originalElement.name}>`,
          original: originalElement.attributes[attribute],
          path: originalElement.path,
          translated: translatedElement.attributes[attribute],
        });
      }
    }
  }

  const mismatchedTags = [
    ...new Set(mismatches.flatMap((mismatch) => [mismatch.original, mismatch.translated].filter(Boolean) as string[])),
  ];
  const errors = mismatches.map((mismatch) => mismatch.message);
  return { isValid: mismatches.length === 0, valid: mismatches.length === 0, errors, mismatches, mismatchedTags };
}
