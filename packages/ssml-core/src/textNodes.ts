import { parseSsml } from "./parser.ts";

export interface SsmlTextNodeContext {
  parentTag: string;
  path: string[];
}

interface TextNodeRecord {
  context: SsmlTextNodeContext;
  decodedText: string;
  end: number;
  sourceEnd: number;
  sourceStart: number;
  start: number;
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

function collectTextNodes(source: string): TextNodeRecord[] {
  const nodes: TextNodeRecord[] = [];
  const path: string[] = [];
  let index = 0;

  const addText = (start: number, end: number, rawText: string, sourceStart = start, sourceEnd = end): void => {
    if (!rawText) return;
    nodes.push({
      context: { parentTag: path[path.length - 1] ?? "", path: [...path] },
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
      path.pop();
      index = end + 1;
      continue;
    }

    const end = findTagEnd(source, index + 1);
    const tag = source.slice(index, end + 1);
    const name = readTagName(tag);
    if (name && !/\/\s*>$/.test(tag)) path.push(name);
    index = end + 1;
  }

  return nodes;
}

export function extractSsmlText(ssml: string): string[] {
  parseSsml(ssml);
  return collectTextNodes(ssml).map((node) => node.decodedText);
}

export async function mapSsmlTextNodes(
  ssml: string,
  transform: (text: string, context: SsmlTextNodeContext) => string | Promise<string>,
): Promise<string> {
  parseSsml(ssml);
  const nodes = collectTextNodes(ssml);
  const replacements = await Promise.all(
    nodes.map(async (node) => {
      const transformed = await transform(node.decodedText, {
        parentTag: node.context.parentTag,
        path: [...node.context.path],
      });
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
