import { parseSsml } from "./parser.ts";

export interface SsmlTextNodeContext {
  parentTag: string;
  parentAttributes: Record<string, string>;
  ancestorTags: string[];
  path: string[];
}

export interface SsmlSourceTextSegment {
  text: string;
  range: { start: number; end: number };
  sourceNodePath: string[];
}

export interface SsmlSourceMarker {
  kind: "mark" | "bookmark";
  name: string;
  originalTextRange: { start: number; end: number };
  sourceNodePath: string[];
}

export interface SsmlSourceMap {
  text: string;
  segments: SsmlSourceTextSegment[];
  markers: SsmlSourceMarker[];
}

export interface MapSsmlTextNodesOptions {
  /** Element names whose text should not be passed to the transform. */
  skipTags?: readonly string[];
  /** Decides whether an individual text node should be passed to the transform. */
  filter?: (context: SsmlTextNodeContext) => boolean;
}

interface TextNodeRecord {
  context: SsmlTextNodeContext;
  decodedText: string;
  end: number;
  sourceEnd: number;
  sourceStart: number;
  start: number;
}

interface OpenElement {
  attributes: Record<string, string>;
  name: string;
}

function decodeXmlText(value: string): string {
  return value.replace(/&(?:amp|apos|gt|lt|quot);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&apos;") return "'";
    if (entity === "&gt;") return ">";
    if (entity === "&lt;") return "<";
    if (entity === "&quot;") return '"';
    const hexadecimal = entity.toLowerCase().startsWith("&#x");
    const digits = entity.slice(hexadecimal ? 3 : 2, -1);
    return String.fromCodePoint(Number.parseInt(digits, hexadecimal ? 16 : 10));
  });
}

function encodeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeXmlAttribute(value: string): string {
  return decodeXmlText(value);
}

function findTagEnd(source: string, start: number): number {
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return source.length - 1;
}

function readTagName(tag: string): string | undefined {
  const match = /^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(tag);
  return match?.[1];
}

function readTagAttributes(tag: string, name: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const nameStart = tag.indexOf(name);
  const attributeSource = tag.slice(nameStart + name.length, tag.length - 1).replace(/\/\s*$/, "");
  const attributePattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of attributeSource.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = decodeXmlAttribute(match[3]);
  }
  return attributes;
}

function collectTextNodes(source: string): TextNodeRecord[] {
  const nodes: TextNodeRecord[] = [];
  const elements: OpenElement[] = [];
  let index = 0;

  const addText = (start: number, end: number, rawText: string, sourceStart = start, sourceEnd = end): void => {
    if (!rawText) return;
    const path = elements.map((element) => element.name);
    const parent = elements[elements.length - 1];
    nodes.push({
      context: {
        ancestorTags: path.slice(0, -1),
        parentAttributes: { ...(parent?.attributes ?? {}) },
        parentTag: parent?.name ?? "",
        path,
      },
      decodedText: decodeXmlText(rawText),
      end,
      sourceEnd,
      sourceStart,
      start,
    });
  };

  while (index < source.length) {
    if (source[index] !== "<") {
      const nextTag = source.indexOf("<", index);
      const end = nextTag === -1 ? source.length : nextTag;
      addText(index, end, source.slice(index, end));
      index = end;
      continue;
    }

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const contentStart = index + 9;
      const end = source.indexOf("]]>", contentStart);
      const contentEnd = end === -1 ? source.length : end;
      addText(
        contentStart,
        contentEnd,
        source.slice(contentStart, contentEnd),
        index,
        end === -1 ? source.length : end + 3,
      );
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("</", index)) {
      const end = findTagEnd(source, index + 2);
      elements.pop();
      index = end + 1;
      continue;
    }

    const end = findTagEnd(source, index + 1);
    const tag = source.slice(index, end + 1);
    const name = readTagName(tag);
    if (name && !/\/\s*>$/.test(tag)) elements.push({ attributes: readTagAttributes(tag, name), name });
    index = end + 1;
  }

  return nodes;
}

interface SourceMapElement {
  name: string;
  path: string[];
  nextChildIndex: number;
}

function collectSourceMap(source: string): SsmlSourceMap {
  const segments: SsmlSourceTextSegment[] = [];
  const markers: SsmlSourceMarker[] = [];
  const elements: SourceMapElement[] = [];
  let textOffset = 0;
  let index = 0;
  const textParts: string[] = [];

  const addText = (value: string): void => {
    if (!value) return;
    const parent = elements[elements.length - 1];
    if (parent) parent.nextChildIndex += 1;
    const sourceNodePath = parent?.path ?? ["speak"];
    const start = textOffset;
    textOffset += value.length;
    textParts.push(value);
    segments.push({ text: value, range: { start, end: textOffset }, sourceNodePath: [...sourceNodePath] });
  };

  while (index < source.length) {
    if (source[index] !== "<") {
      const end = source.indexOf("<", index);
      const textEnd = end === -1 ? source.length : end;
      addText(decodeXmlText(source.slice(index, textEnd)));
      index = textEnd;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const contentStart = index + 9;
      const end = source.indexOf("]]>", contentStart);
      const contentEnd = end === -1 ? source.length : end;
      addText(source.slice(contentStart, contentEnd));
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    const end = findTagEnd(source, index + 1);
    const rawTag = source.slice(index, end + 1);
    if (rawTag.startsWith("</")) {
      elements.pop();
      index = end + 1;
      continue;
    }
    const name = readTagName(rawTag);
    if (!name) {
      index = end + 1;
      continue;
    }
    const parent = elements[elements.length - 1];
    const childIndex = parent?.nextChildIndex ?? 0;
    if (parent) parent.nextChildIndex += 1;
    const path = parent ? [...parent.path, `${name}[${childIndex}]`] : [name];
    const attributes = readTagAttributes(rawTag, name);
    const normalizedName = name.toLowerCase();
    if (normalizedName === "mark" || normalizedName === "bookmark") {
      const markerName = attributes[normalizedName === "mark" ? "name" : "mark"];
      if (markerName) {
        markers.push({
          kind: normalizedName,
          name: markerName,
          originalTextRange: { start: textOffset, end: textOffset },
          sourceNodePath: [...path],
        });
      }
    }
    if (!/\/\s*>$/.test(rawTag)) elements.push({ name, path, nextChildIndex: 0 });
    index = end + 1;
  }
  return { text: textParts.join(""), segments, markers };
}

/** Returns decoded source text segments and marker locations with indexed SSML paths. */
export function getSsmlSourceMap(ssml: string): SsmlSourceMap {
  parseSsml(ssml);
  return collectSourceMap(ssml);
}

export function extractSsmlText(ssml: string): string[] {
  parseSsml(ssml);
  return collectTextNodes(ssml).map((node) => node.decodedText);
}

export async function mapSsmlTextNodes(
  ssml: string,
  transform: (text: string, context: SsmlTextNodeContext) => string | Promise<string>,
  options: MapSsmlTextNodesOptions = {},
): Promise<string> {
  parseSsml(ssml);
  const nodes = collectTextNodes(ssml);
  const skipTags = new Set((options.skipTags ?? ["phoneme", "say-as", "sub"]).map((tag) => tag.toLowerCase()));
  const replacements = await Promise.all(
    nodes.map(async (node) => {
      const context = {
        ancestorTags: [...node.context.ancestorTags],
        parentAttributes: { ...node.context.parentAttributes },
        parentTag: node.context.parentTag,
        path: [...node.context.path],
      };
      const shouldTransform = !skipTags.has(context.parentTag.toLowerCase()) && (options.filter?.(context) ?? true);
      if (!shouldTransform) return ssml.slice(node.sourceStart, node.sourceEnd);
      const transformed = await transform(node.decodedText, context);
      if (typeof transformed !== "string") {
        throw new TypeError("SSML text node transform must return a string");
      }
      return transformed === node.decodedText
        ? ssml.slice(node.sourceStart, node.sourceEnd)
        : encodeXmlText(transformed);
    }),
  );

  let result = "";
  let cursor = 0;
  nodes.forEach((node, nodeIndex) => {
    result += ssml.slice(cursor, node.sourceStart) + replacements[nodeIndex];
    cursor = node.sourceEnd;
  });
  return result + ssml.slice(cursor);
}
