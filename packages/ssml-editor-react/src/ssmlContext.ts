export interface SsmlVoiceContext {
  voiceName?: string;
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

function closeElement(stack: OpenElement[], name: string): void {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.name === name) {
      stack.splice(index);
      return;
    }
  }
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
