export interface SsmlVoiceContext {
  voiceName?: string;
}

interface OpenElement {
  name: string;
  voiceName?: string;
}

export interface SsmlOffsetRange {
  start: number;
  end: number;
}

export interface EnclosingTagRange {
  tagName: string;
  openingTag: SsmlOffsetRange;
  closingTag?: SsmlOffsetRange;
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

interface ParsedTagRange extends EnclosingTagRange {
  selfClosing: boolean;
}

function getTagName(tag: string, closing: boolean): string | undefined {
  const pattern = closing
    ? /^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)/
    : /^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/;
  return tag.match(pattern)?.[1]?.toLowerCase();
}

function isIgnoredTag(source: string, start: number): boolean {
  return source.startsWith("<!--", start) || source.startsWith("<![CDATA[", start) || source.startsWith("<?", start);
}

function getIgnoredTagEnd(source: string, start: number): number | undefined {
  if (source.startsWith("<!--", start)) {
    const end = source.indexOf("-->", start + 4);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith("<![CDATA[", start)) {
    const end = source.indexOf("]]>", start + 9);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith("<?", start)) {
    const end = source.indexOf("?>", start + 2);
    return end === -1 ? source.length : end + 2;
  }
  return undefined;
}

export function getEnclosingTagRange(
  source: string,
  offset: number,
  targetTagName?: string,
): EnclosingTagRange | null {
  const limit = Math.max(0, Math.min(offset, source.length));
  const target = targetTagName?.toLowerCase();
  const stack: ParsedTagRange[] = [];
  const tags: ParsedTagRange[] = [];
  let index = 0;

  while (index < source.length) {
    const tagStart = source.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    if (isIgnoredTag(source, tagStart)) {
      index = getIgnoredTagEnd(source, tagStart) ?? source.length;
      continue;
    }

    const tagEnd = findTagEnd(source, tagStart, source.length);
    if (tagEnd === -1) {
      break;
    }

    const tag = source.slice(tagStart, tagEnd + 1);
    const range = { start: tagStart, end: tagEnd + 1 };
    const closingName = getTagName(tag, true);
    if (closingName) {
      let stackIndex = -1;
      for (let stackIndexCandidate = stack.length - 1; stackIndexCandidate >= 0; stackIndexCandidate -= 1) {
        if (stack[stackIndexCandidate]?.tagName === closingName) {
          stackIndex = stackIndexCandidate;
          break;
        }
      }
      if (stackIndex !== -1) {
        const openingTag = stack[stackIndex];
        if (openingTag) {
          openingTag.closingTag = range;
        }
        stack.splice(stackIndex);
      }
      index = tagEnd + 1;
      continue;
    }

    if (tag.startsWith("<!")) {
      index = tagEnd + 1;
      continue;
    }

    const openingName = getTagName(tag, false);
    if (!openingName) {
      index = tagEnd + 1;
      continue;
    }

    const parsedTag: ParsedTagRange = {
      tagName: openingName,
      openingTag: range,
      selfClosing: /\/\s*>$/.test(tag),
    };
    tags.push(parsedTag);
    if (!parsedTag.selfClosing) {
      stack.push(parsedTag);
    }
    index = tagEnd + 1;
  }

  const candidates = tags
    .filter(({ tagName }) => target === undefined || tagName === target)
    .filter(({ selfClosing, closingTag }) => selfClosing || closingTag !== undefined)
    .filter(({ openingTag, closingTag }) => {
      if (openingTag.start <= limit && limit < openingTag.end) {
        return true;
      }
      return closingTag !== undefined && openingTag.end <= limit && limit < closingTag.end;
    });

  const candidate = candidates.at(-1);
  if (!candidate) {
    return null;
  }

  const { selfClosing: _selfClosing, ...result } = candidate;
  return result;
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
