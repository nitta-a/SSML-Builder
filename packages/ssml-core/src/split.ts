import { buildSsml } from "./builder.ts";
import { parseSsml } from "./parser.ts";
import type { SsmlDocument, SsmlElement, SsmlNode } from "./types.ts";

const DEFAULT_MAX_LENGTH = 10_000;

export interface SsmlTextRange {
  start: number;
  end: number;
}

export interface SsmlChunkContext {
  voice?: string;
  lang?: string;
  prosody?: Record<string, string>;
}

export interface SsmlChunk {
  chunkIndex: number;
  ssml: string;
  originalTextRange: SsmlTextRange;
  inheritedContext: SsmlChunkContext;
  containedMarks: string[];
  hasBackgroundAudio: boolean;
}

export interface SplitSsmlOptions {
  maxLength?: number;
  /** Keeps `<mstts:backgroundaudio>` in every chunk instead of the first chunk only. */
  replicateBackgroundAudio?: boolean;
}

function cloneElement(element: SsmlElement, children: SsmlNode[]): SsmlElement {
  return { ...element, children };
}

function documentWithChildren(document: SsmlDocument, children: SsmlNode[]): string {
  return buildSsml({ ...document, children });
}

function wrapWithContext(node: SsmlNode, context: SsmlElement[]): SsmlNode {
  return context.reduceRight<SsmlNode>((current, parent) => cloneElement(parent, [current]), node);
}

function documentWithNode(document: SsmlDocument, node: SsmlNode, context: SsmlElement[]): string {
  return documentWithChildren(document, [wrapWithContext(node, context)]);
}

function splitTextNode(text: string, document: SsmlDocument, context: SsmlElement[], maxLength: number): SsmlNode[] {
  if (!text) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + 1;
    let bestEnd = end;
    while (end <= text.length) {
      if (documentWithNode(document, text.slice(start, end), context).length > maxLength) break;
      bestEnd = end;
      end += 1;
    }
    if (bestEnd === start) {
      throw new RangeError("maxLength is too small to contain the SSML document wrapper");
    }

    // Prefer a word boundary, but fall back to a character for long words.
    const segment = text.slice(start, bestEnd);
    const boundary = Math.max(segment.lastIndexOf(" "), segment.lastIndexOf("\n"), segment.lastIndexOf("\t"));
    const splitEnd = boundary > 0 ? start + boundary + 1 : bestEnd;
    parts.push(text.slice(start, splitEnd));
    start = splitEnd;
  }
  return parts;
}

function splitNode(document: SsmlDocument, node: SsmlNode, maxLength: number, context: SsmlElement[] = []): SsmlNode[] {
  if (typeof node === "string" || node.type === "text") {
    const value = typeof node === "string" ? node : node.value;
    if (documentWithNode(document, node, context).length <= maxLength) return [node];
    return splitTextNode(value, document, context, maxLength);
  }

  if (documentWithNode(document, node, context).length <= maxLength) return [node];
  const children = node.children ?? [];
  if (children.length === 0) {
    throw new RangeError(`maxLength is too small to contain <${node.type}>`);
  }

  const splitChildren = children.flatMap((child) => splitNode(document, child, maxLength, [...context, node]));
  const parts: SsmlNode[] = [];
  let group: SsmlNode[] = [];
  const flush = (): void => {
    if (group.length > 0) {
      parts.push(cloneElement(node, group));
      group = [];
    }
  };

  for (const child of splitChildren) {
    const candidate = cloneElement(node, [...group, child]);
    if (documentWithNode(document, candidate, context).length <= maxLength) {
      group.push(child);
      continue;
    }
    flush();
    if (documentWithNode(document, cloneElement(node, [child]), context).length > maxLength) {
      throw new RangeError(`maxLength is too small to contain <${node.type}>`);
    }
    group.push(child);
  }
  flush();
  return parts;
}

function textFromNode(node: SsmlNode): string {
  if (typeof node === "string") return node;
  if (node.type === "text") return node.value;
  return (node.children ?? []).map(textFromNode).join("");
}

function collectMarks(node: SsmlNode, marks: string[]): void {
  if (typeof node === "string" || node.type === "text") return;
  if (node.type === "mark" && node.name) marks.push(node.name);
  if (node.type === "bookmark" && node.mark) marks.push(node.mark);
  for (const child of node.children ?? []) collectMarks(child, marks);
}

function collectInheritedContext(nodes: SsmlNode[]): SsmlChunkContext {
  const context: SsmlChunkContext = {};
  const visit = (node: SsmlNode): void => {
    if (typeof node === "string" || node.type === "text") return;
    if (context.voice === undefined && node.type === "voice" && node.name) context.voice = node.name;
    if (context.lang === undefined && node.type === "lang" && node.lang) context.lang = node.lang;
    if (context.prosody === undefined && node.type === "prosody") {
      const prosody: Record<string, string> = {};
      for (const [key, value] of Object.entries(node.attributes ?? {})) prosody[key] = String(value);
      for (const key of ["rate", "pitch", "volume", "contour", "range"] as const) {
        const value = node[key];
        if (value !== undefined) prosody[key] = String(value);
      }
      if (Object.keys(prosody).length > 0) context.prosody = prosody;
    }
    for (const child of node.children ?? []) visit(child);
  };
  nodes.forEach(visit);
  return context;
}

function createChunk(
  document: SsmlDocument,
  nodes: SsmlNode[],
  chunkIndex: number,
  textStart: number,
  backgroundAudio: SsmlNode | undefined,
  replicateBackgroundAudio: boolean,
): SsmlChunk {
  const chunkNodes =
    backgroundAudio && (replicateBackgroundAudio || chunkIndex === 0) ? [backgroundAudio, ...nodes] : nodes;
  const text = nodes.map(textFromNode).join("");
  const marks: string[] = [];
  for (const node of nodes) collectMarks(node, marks);
  const inheritedContext = collectInheritedContext(nodes);
  if (inheritedContext.lang === undefined && document.lang) inheritedContext.lang = document.lang;
  return {
    chunkIndex,
    ssml: documentWithChildren(document, chunkNodes),
    originalTextRange: { start: textStart, end: textStart + text.length },
    inheritedContext,
    containedMarks: marks,
    hasBackgroundAudio: chunkNodes.some(
      (node) => typeof node !== "string" && node.type !== "text" && node.type === "mstts:backgroundaudio",
    ),
  };
}

/**
 * Splits SSML into independently synthesizable documents without breaking XML
 * elements. Parent elements such as `<voice>` and `<prosody>` are copied into
 * every block. Paragraph and sentence elements therefore remain the natural
 * split points, while oversized text is split at word/character boundaries.
 */
export function splitSsmlDocument(
  ssml: string,
  maxLength: number | SplitSsmlOptions = DEFAULT_MAX_LENGTH,
  options: SplitSsmlOptions = {},
): SsmlChunk[] {
  const resolvedMaxLength = typeof maxLength === "number" ? maxLength : (maxLength.maxLength ?? DEFAULT_MAX_LENGTH);
  const resolvedOptions = typeof maxLength === "number" ? options : maxLength;
  if (!Number.isInteger(resolvedMaxLength) || resolvedMaxLength <= 0) {
    throw new RangeError("maxLength must be a positive integer");
  }
  const document = parseSsml(ssml);
  const backgroundAudio = (document.children ?? []).find(
    (node): node is SsmlElement =>
      typeof node !== "string" && node.type !== "text" && node.type === "mstts:backgroundaudio",
  );
  if (ssml.length <= resolvedMaxLength) {
    return [createChunk(document, document.children ?? [], 0, 0, backgroundAudio, true)];
  }

  const contentChildren = (document.children ?? []).filter((node) => node !== backgroundAudio);
  const plainDocumentLength = documentWithChildren(document, []).length;
  const backgroundDocumentLength = backgroundAudio
    ? documentWithChildren(document, [backgroundAudio]).length
    : plainDocumentLength;
  const backgroundOverhead = Math.max(0, backgroundDocumentLength - plainDocumentLength);
  const contentMaxLength = Math.max(1, resolvedMaxLength - backgroundOverhead);
  const splitChildren = contentChildren.flatMap((child) => splitNode(document, child, contentMaxLength));
  const chunks: SsmlNode[][] = [];
  let group: SsmlNode[] = [];
  for (const child of splitChildren) {
    const candidate = [...group, child];
    if (documentWithChildren(document, candidate).length <= contentMaxLength) {
      group = candidate;
      continue;
    }
    if (group.length > 0) chunks.push(group);
    group = [child];
    if (documentWithChildren(document, group).length > contentMaxLength) {
      throw new RangeError("maxLength is too small to contain the SSML document wrapper");
    }
  }
  if (group.length > 0) chunks.push(group);
  if (chunks.length === 0) {
    const result = createChunk(document, [], 0, 0, backgroundAudio, resolvedOptions.replicateBackgroundAudio ?? false);
    if (result.ssml.length > resolvedMaxLength) {
      throw new RangeError("maxLength is too small to contain the SSML document wrapper");
    }
    return [result];
  }
  let textStart = 0;
  return chunks.map((chunk, chunkIndex) => {
    const result = createChunk(
      document,
      chunk,
      chunkIndex,
      textStart,
      backgroundAudio,
      resolvedOptions.replicateBackgroundAudio ?? false,
    );
    textStart = result.originalTextRange.end;
    return result;
  });
}
