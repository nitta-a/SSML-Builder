import { buildSsml } from "./builder.ts";
import { parseSsml } from "./parser.ts";
import type { SsmlDocument, SsmlElement, SsmlNode } from "./types.ts";

const DEFAULT_MAX_LENGTH = 10_000;

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

/**
 * Splits SSML into independently synthesizable documents without breaking XML
 * elements. Parent elements such as `<voice>` and `<prosody>` are copied into
 * every block. Paragraph and sentence elements therefore remain the natural
 * split points, while oversized text is split at word/character boundaries.
 */
export function splitSsmlDocument(ssml: string, maxLength: number = DEFAULT_MAX_LENGTH): string[] {
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new RangeError("maxLength must be a positive integer");
  }
  const document = parseSsml(ssml);
  if (ssml.length <= maxLength) return [ssml];

  const children = document.children ?? [];
  const splitChildren = children.flatMap((child) => splitNode(document, child, maxLength));
  const chunks: SsmlNode[][] = [];
  let group: SsmlNode[] = [];
  for (const child of splitChildren) {
    const candidate = [...group, child];
    if (documentWithChildren(document, candidate).length <= maxLength) {
      group = candidate;
      continue;
    }
    if (group.length > 0) chunks.push(group);
    group = [child];
    if (documentWithChildren(document, group).length > maxLength) {
      throw new RangeError("maxLength is too small to contain the SSML document wrapper");
    }
  }
  if (group.length > 0) chunks.push(group);
  return chunks.map((chunk) => documentWithChildren(document, chunk));
}
