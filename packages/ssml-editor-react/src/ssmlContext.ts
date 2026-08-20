export interface SsmlVoiceContext {
  voiceName?: string;
}

export interface SsmlTagRange {
  start: number;
  end: number;
}

interface OpenElement {
  name: string;
  voiceName?: string;
}

function findTagEnd(source: string, start: number, limit: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < limit; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index;
    }
  }
  return -1;
}

function getVoiceName(tag: string): string | undefined {
  return tag.match(/\bname\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

export function updateTagAttribute(
  text: string,
  tagRange: SsmlTagRange,
  attributeName: string,
  newValue: string,
): string {
  const start = Math.max(0, Math.min(tagRange.start, text.length));
  const end = Math.max(start, Math.min(tagRange.end, text.length));
  const tag = text.slice(start, end);
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attributePattern = new RegExp(`(\\b${escapedAttributeName}\\s*=\\s*)(["'])([\\s\\S]*?)\\2`, "i");
  const escapedValue = escapeXmlAttribute(newValue);
  const match = tag.match(attributePattern);

  if (match?.index !== undefined) {
    const valueStart = match.index + match[0].indexOf(match[2]) + 1;
    const valueEnd = valueStart + (match[3]?.length ?? 0);
    return `${text.slice(0, start)}${tag.slice(0, valueStart)}${escapedValue}${tag.slice(valueEnd)}${text.slice(end)}`;
  }

  const insertionIndex = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
  const attribute = ` ${attributeName}="${escapedValue}"`;
  return `${text.slice(0, start)}${tag.slice(0, insertionIndex)}${attribute}${tag.slice(insertionIndex)}${text.slice(end)}`;
}

function closeElement(stack: OpenElement[], name: string): void {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.name === name) {
      stack.splice(index);
      return;
    }
  }
}

export function findActiveSsmlTags(source: string, offset: number): Set<string> {
  const limit = Math.max(0, Math.min(offset, source.length));
  const stack: OpenElement[] = [];
  let index = 0;

  while (index < source.length) {
    const tagStart = source.indexOf("<", index);
    if (tagStart === -1 || tagStart > limit) {
      break;
    }

    const nonContentEnd = source.startsWith("<!--", tagStart)
      ? source.indexOf("-->", tagStart + 4)
      : source.startsWith("<![CDATA[", tagStart)
        ? source.indexOf("]]>", tagStart + 9)
        : source.startsWith("<?", tagStart)
          ? source.indexOf("?>", tagStart + 2)
          : undefined;
    if (nonContentEnd !== undefined) {
      const delimiterLength = source.startsWith("<?", tagStart) ? 2 : 3;
      const end = nonContentEnd === -1 ? source.length : nonContentEnd + delimiterLength;
      if (limit < end) {
        break;
      }
      index = end;
      continue;
    }

    const tagEnd = findTagEnd(source, tagStart, source.length);
    const tag = source.slice(tagStart, tagEnd === -1 ? source.length : tagEnd + 1);
    const closingMatch = tag.match(/^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
    const openingMatch = tag.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);

    if (tagEnd === -1 || limit <= tagEnd) {
      if (openingMatch?.[1]) {
        stack.push({ name: openingMatch[1].toLowerCase() });
      }
      break;
    }

    if (closingMatch?.[1]) {
      closeElement(stack, closingMatch[1].toLowerCase());
    } else if (openingMatch?.[1] && !/\/\s*>$/.test(tag)) {
      stack.push({ name: openingMatch[1].toLowerCase() });
    }
    index = tagEnd + 1;
  }

  return new Set(stack.map(({ name }) => name));
}

export function findSsmlVoiceContext(source: string, offset: number): SsmlVoiceContext | undefined {
  const limit = Math.max(0, Math.min(offset, source.length));
  const stack: OpenElement[] = [];
  let index = 0;

  while (index < limit) {
    const tagStart = source.indexOf("<", index);
    if (tagStart === -1 || tagStart >= limit) {
      break;
    }

    if (source.startsWith("<!--", tagStart)) {
      const end = source.indexOf("-->", tagStart + 4);
      index = end === -1 || end + 3 > limit ? limit : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", tagStart)) {
      const end = source.indexOf("]]>", tagStart + 9);
      index = end === -1 || end + 3 > limit ? limit : end + 3;
      continue;
    }
    if (source.startsWith("<?", tagStart)) {
      const end = source.indexOf("?>", tagStart + 2);
      index = end === -1 || end + 2 > limit ? limit : end + 2;
      continue;
    }

    const tagEnd = findTagEnd(source, tagStart, limit);
    if (tagEnd === -1) {
      break;
    }
    const tag = source.slice(tagStart, tagEnd + 1);
    if (tag.startsWith("<!")) {
      index = tagEnd + 1;
      continue;
    }

    const closingMatch = tag.match(/^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (closingMatch?.[1]) {
      closeElement(stack, closingMatch[1].toLowerCase());
      index = tagEnd + 1;
      continue;
    }

    const openingMatch = tag.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (openingMatch?.[1] && !/\/\s*>$/.test(tag)) {
      const name = openingMatch[1].toLowerCase();
      stack.push({
        name,
        ...(name === "voice" ? { voiceName: getVoiceName(tag) } : {}),
      });
    }
    index = tagEnd + 1;
  }

  for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
    const element = stack[stackIndex];
    if (element?.name === "voice") {
      return element.voiceName === undefined ? {} : { voiceName: element.voiceName };
    }
  }
  return undefined;
}
