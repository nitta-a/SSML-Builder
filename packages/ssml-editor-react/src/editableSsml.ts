import { buildSsml, parseSsml } from "@ssml-builder-js/ssml-core";
import type { ProsodyElement, SsmlDocument, SsmlElement, SsmlNode, VoiceElement } from "@ssml-builder-js/ssml-core";
import { INTRINSICALLY_EMPTY_ELEMENTS } from "./formatXml";

interface EditableStartTag {
  name: string;
  selfClosing: boolean;
}

function isSsmlElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function isVoice(element: SsmlElement): element is VoiceElement {
  return element.type === "voice";
}

function isProsody(element: SsmlElement): element is ProsodyElement {
  return element.type === "prosody";
}

function getSsmlElementName(element: SsmlElement): string {
  return element.type === "custom" || element.type === "element" ? element.name : element.type;
}

function findEditableTagEnd(source: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < source.length; index += 1) {
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
  return source.length;
}

function collectEditableStartTags(source: string): EditableStartTag[] {
  const tags: EditableStartTag[] = [];
  let index = 0;

  while (index < source.length) {
    if (source[index] !== "<") {
      index += 1;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + 9);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("</", index) || source.startsWith("<!", index)) {
      const end = findEditableTagEnd(source, index);
      index = end === source.length ? source.length : end + 1;
      continue;
    }

    const end = findEditableTagEnd(source, index);
    if (end === source.length) {
      break;
    }
    const raw = source.slice(index, end + 1);
    const match = raw.match(/^<([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (match) {
      tags.push({ name: match[1], selfClosing: /\/\s*>$/.test(raw) });
    }
    index = end + 1;
  }

  return tags;
}

function preserveEmptyPairElements(
  nodes: SsmlNode[],
  startTags: readonly EditableStartTag[],
  startTagIndex: { value: number },
): SsmlNode[] {
  return nodes.map((node) => {
    if (!isSsmlElement(node)) {
      return node;
    }

    const elementName = getSsmlElementName(node);
    const startTag = startTags[startTagIndex.value];
    startTagIndex.value += 1;
    if (node.children === undefined || node.children.length === 0) {
      return startTag?.name === elementName && !startTag.selfClosing && !INTRINSICALLY_EMPTY_ELEMENTS.has(elementName)
        ? { ...node, children: [""] }
        : node;
    }

    const children = preserveEmptyPairElements(node.children, startTags, startTagIndex);
    if (children.every((child, index) => child === node.children?.[index])) {
      return node;
    }
    return { ...node, children };
  });
}

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function findFirstElementPath(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => boolean,
  ancestors: readonly SsmlElement[] = [],
): SsmlElement[] | undefined {
  for (const node of nodes) {
    if (!isSsmlElement(node)) {
      continue;
    }

    const path = [...ancestors, node];
    if (predicate(node)) {
      return path;
    }

    const childPath = findFirstElementPath(node.children ?? [], predicate, path);
    if (childPath) {
      return childPath;
    }
  }
  return undefined;
}

function updateFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
  update: (element: T) => SsmlElement,
): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || !isSsmlElement(node)) {
      return node;
    }

    if (predicate(node)) {
      updated = true;
      return update(node);
    }

    if (node.children) {
      const result = updateFirstElement(node.children, predicate, update);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function withChildren(document: SsmlDocument, children: SsmlNode[]): SsmlDocument {
  const nextDocument: SsmlDocument = { ...document, children };
  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }
  return nextDocument;
}

function parseEditableText(value: string, lang: string): SsmlNode[] {
  try {
    const wrapper = buildSsml({
      version: "1.0",
      lang,
      children: [],
    });
    const openingTagEnd = wrapper.indexOf(">") + 1;
    const children = parseSsml(`${wrapper.slice(0, openingTagEnd)}${value}</speak>`).children ?? [];
    return children.some(isSsmlElement)
      ? preserveEmptyPairElements(children, collectEditableStartTags(value), { value: 0 })
      : [value];
  } catch {
    return [value];
  }
}

function serializeEditableText(nodes: SsmlNode[], lang: string): string {
  if (nodes.length === 1 && typeof nodes[0] === "string") {
    return nodes[0];
  }

  const xml = buildSsml({
    version: "1.0",
    lang,
    children: nodes,
  });
  const contentStart = xml.indexOf(">") + 1;
  return xml.slice(contentStart, -"</speak>".length);
}

export function getEditableRegion(document: SsmlDocument): { children: SsmlNode[]; voiceName?: string } {
  const children = getDocumentChildren(document);
  const path = findFirstElementPath(children, isProsody) ?? findFirstElementPath(children, isVoice);
  const element = path ? path[path.length - 1] : undefined;
  const voice = path ? [...path].reverse().find(isVoice) : undefined;
  return {
    children: element?.children ?? children,
    ...(voice ? { voiceName: voice.name } : {}),
  };
}

export function getEditableText(document: SsmlDocument): string {
  return serializeEditableText(getEditableRegion(document).children, document.lang);
}

export function updateEditableText(document: SsmlDocument, value: string): SsmlDocument {
  const nextChildren = parseEditableText(value, document.lang);
  const editableChildren = nextChildren.length > 0 ? nextChildren : [value];
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    children: editableChildren,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: editableChildren,
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, editableChildren);
}
