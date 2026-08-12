const INDENT = "  ";
const FRAGMENT_ROOT = "ssml-builder-fragment";
const XML_ENTITY_NAMES = new Set(["amp", "apos", "gt", "lt", "quot"]);

type XmlNode = XmlElementNode | XmlTextNode | XmlMarkupNode;

interface XmlElementNode {
  kind: "element";
  name: string;
  open: string;
  close?: string;
  selfClosing: boolean;
  children: XmlNode[];
}

interface XmlTextNode {
  kind: "text";
  value: string;
}

interface XmlMarkupNode {
  kind: "comment" | "cdata" | "declaration" | "processing-instruction";
  raw: string;
}

interface XmlDocument {
  children: XmlNode[];
  root: XmlElementNode;
}

function isXmlNameStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/.test(value);
}

function isXmlNameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_.:-]/.test(value);
}

function isXmlWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function fail(message: string): never {
  throw new Error(message);
}

function skipWhitespace(source: string, index: number): number {
  while (isXmlWhitespace(source[index])) {
    index += 1;
  }
  return index;
}

function readName(source: string, start: number, end: number): { name: string; index: number } {
  if (!isXmlNameStart(source[start])) {
    fail("Invalid XML name");
  }

  let index = start + 1;
  while (index < end && isXmlNameCharacter(source[index])) {
    index += 1;
  }

  return { name: source.slice(start, index), index };
}

function validateCharacterReference(entity: string): void {
  const isHexadecimal = entity.startsWith("#x") || entity.startsWith("#X");
  const isDecimal = entity.startsWith("#");
  if (!isHexadecimal && !isDecimal) {
    if (!XML_ENTITY_NAMES.has(entity)) {
      fail(`Unknown XML entity: &${entity};`);
    }
    return;
  }

  const digits = entity.slice(isHexadecimal ? 2 : 1);
  const validDigits = isHexadecimal ? /^[0-9A-Fa-f]+$/.test(digits) : /^[0-9]+$/.test(digits);
  const codePoint = Number.parseInt(digits, isHexadecimal ? 16 : 10);
  if (
    !validDigits ||
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    (codePoint < 0x20 && ![9, 10, 13].includes(codePoint))
  ) {
    fail(`Invalid XML character reference: &${entity};`);
  }
}

function validateEntityReferences(value: string): void {
  let index = 0;

  while (true) {
    const ampersand = value.indexOf("&", index);
    if (ampersand === -1) {
      return;
    }

    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon === -1) {
      fail("Unterminated XML entity reference");
    }

    validateCharacterReference(value.slice(ampersand + 1, semicolon));
    index = semicolon + 1;
  }
}

function findTagEnd(source: string, start: number, hasInternalSubset = false): number {
  let quote: string | undefined;
  let subsetDepth = 0;

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

    if (hasInternalSubset) {
      if (character === "[") {
        subsetDepth += 1;
        continue;
      }
      if (character === "]" && subsetDepth > 0) {
        subsetDepth -= 1;
        continue;
      }
    }

    if (character === ">" && subsetDepth === 0) {
      return index;
    }
  }

  fail("Unclosed XML markup");
}

function parseStartTag(
  source: string,
  start: number,
  end: number,
): {
  name: string;
  selfClosing: boolean;
} {
  const nameResult = readName(source, start + 1, end);
  let index = nameResult.index;
  let hasAttribute = false;
  const attributeNames = new Set<string>();

  while (index < end) {
    const beforeWhitespace = index;
    index = skipWhitespace(source, index);
    if (index === end) {
      break;
    }

    if (source[index] === "/") {
      if (index + 1 !== end) {
        fail("Invalid XML self-closing tag");
      }
      return { name: nameResult.name, selfClosing: true };
    }

    if (hasAttribute && beforeWhitespace === index) {
      fail("XML attributes must be separated by whitespace");
    }

    const attribute = readName(source, index, end);
    index = skipWhitespace(source, attribute.index);
    if (source[index] !== "=") {
      fail(`XML attribute ${attribute.name} must have a value`);
    }
    index = skipWhitespace(source, index + 1);

    const quote = source[index];
    if (quote !== '"' && quote !== "'") {
      fail(`XML attribute ${attribute.name} must use a quoted value`);
    }
    index += 1;

    const valueStart = index;
    while (index < end && source[index] !== quote) {
      if (source[index] === "<") {
        fail(`Invalid "<" in XML attribute ${attribute.name}`);
      }
      index += 1;
    }
    if (index === end) {
      fail(`Unclosed XML attribute ${attribute.name}`);
    }

    if (attributeNames.has(attribute.name)) {
      fail(`Duplicate XML attribute: ${attribute.name}`);
    }
    attributeNames.add(attribute.name);
    validateEntityReferences(source.slice(valueStart, index));
    index += 1;
    hasAttribute = true;
  }

  return { name: nameResult.name, selfClosing: false };
}

function parseClosingTag(source: string, start: number, end: number): string {
  const nameResult = readName(source, start + 2, end);
  if (skipWhitespace(source, nameResult.index) !== end) {
    fail("Invalid XML closing tag");
  }
  return nameResult.name;
}

function parseProcessingInstruction(source: string, start: number, end: number): void {
  readName(source, start + 2, end);
}

function parseDeclaration(source: string, start: number, end: number): void {
  readName(source, start + 2, end);
}

function appendNode(nodes: XmlNode[], node: XmlNode): void {
  const previous = nodes[nodes.length - 1];
  if (node.kind === "text" && previous?.kind === "text") {
    previous.value += node.value;
    return;
  }
  nodes.push(node);
}

function currentElement(stack: XmlElementNode[]): XmlElementNode | undefined {
  return stack[stack.length - 1];
}

function parseXml(source: string): XmlDocument {
  const children: XmlNode[] = [];
  const stack: XmlElementNode[] = [];
  let root: XmlElementNode | undefined;
  let index = 0;

  while (index < source.length) {
    if (source[index] !== "<") {
      const textStart = index;
      while (index < source.length && source[index] !== "<") {
        index += 1;
      }

      const value = source.slice(textStart, index);
      if (value.includes("]]>")) {
        fail("CDATA termination is not valid in ordinary XML text");
      }
      validateEntityReferences(value);
      if (stack.length === 0 && value.trim() !== "") {
        fail("Unexpected text outside the root XML element");
      }
      appendNode(currentElement(stack)?.children ?? children, { kind: "text", value });
      continue;
    }

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) {
        fail("Unclosed XML comment");
      }
      const content = source.slice(index + 4, end);
      if (content.includes("--") || content.endsWith("-")) {
        fail("Invalid XML comment");
      }
      appendNode(currentElement(stack)?.children ?? children, {
        kind: "comment",
        raw: source.slice(index, end + 3),
      });
      index = end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + "<![CDATA[".length);
      if (end === -1) {
        fail("Unclosed XML CDATA section");
      }
      if (stack.length === 0) {
        fail("CDATA is not allowed outside the root XML element");
      }
      appendNode(currentElement(stack)?.children ?? children, {
        kind: "cdata",
        raw: source.slice(index, end + 3),
      });
      index = end + 3;
      continue;
    }

    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) {
        fail("Unclosed XML processing instruction");
      }
      parseProcessingInstruction(source, index, end);
      appendNode(currentElement(stack)?.children ?? children, {
        kind: "processing-instruction",
        raw: source.slice(index, end + 2),
      });
      index = end + 2;
      continue;
    }

    if (source.startsWith("</", index)) {
      const end = findTagEnd(source, index);
      const name = parseClosingTag(source, index, end);
      const element = currentElement(stack);
      if (element === undefined || element.name !== name) {
        fail(`Mismatched closing XML element: </${name}>`);
      }
      element.close = source.slice(index, end + 1);
      stack.pop();
      index = end + 1;
      continue;
    }

    if (source.startsWith("<!", index)) {
      const end = findTagEnd(source, index, true);
      parseDeclaration(source, index, end);
      appendNode(currentElement(stack)?.children ?? children, {
        kind: "declaration",
        raw: source.slice(index, end + 1),
      });
      index = end + 1;
      continue;
    }

    const end = findTagEnd(source, index);
    const { name, selfClosing } = parseStartTag(source, index, end);
    if (stack.length === 0) {
      if (root !== undefined) {
        fail("Multiple root XML elements are not allowed");
      }
      root = {
        kind: "element",
        name,
        open: source.slice(index, end + 1),
        selfClosing,
        children: [],
      };
      children.push(root);
    } else {
      const element: XmlElementNode = {
        kind: "element",
        name,
        open: source.slice(index, end + 1),
        selfClosing,
        children: [],
      };
      currentElement(stack)?.children.push(element);
      if (!selfClosing) {
        stack.push(element);
      }
      index = end + 1;
      continue;
    }

    if (!selfClosing) {
      stack.push(root);
    }
    index = end + 1;
  }

  if (stack.length > 0) {
    fail(`Unclosed XML element: <${currentElement(stack)?.name}>`);
  }
  if (root === undefined) {
    fail("XML input does not contain a root element");
  }

  return { children, root };
}

function indentation(depth: number): string {
  return INDENT.repeat(depth);
}

function renderInline(node: XmlElementNode): string {
  const content = node.children
    .map((child) => {
      if (child.kind === "element") {
        return renderInline(child);
      }
      return child.kind === "text" ? child.value : child.raw;
    })
    .join("");

  return `${node.open}${content}${node.close ?? ""}`;
}

function hasOnlyTextChildren(node: XmlElementNode): boolean {
  return node.children.every((child) => child.kind === "text");
}

function hasSignificantText(node: XmlElementNode): boolean {
  return node.children.some((child) => child.kind === "text" && child.value.trim() !== "");
}

function formatElement(node: XmlElementNode, depth: number, isRoot: boolean): string[] {
  const prefix = indentation(depth);

  if (node.selfClosing) {
    return [`${prefix}${node.open}`];
  }
  if (node.close === undefined) {
    fail(`Unclosed XML element: <${node.name}>`);
  }

  if (isRoot && hasOnlyTextChildren(node)) {
    const text = node.children
      .filter((child): child is XmlTextNode => child.kind === "text")
      .map((child) => child.value)
      .join("");
    const trimmedText = text.trim();

    if (trimmedText === "") {
      return [`${prefix}${node.open}`, `${prefix}${node.close}`];
    }
    if (text.includes("\n") || text.includes("\r") || text !== trimmedText) {
      return [`${prefix}${renderInline(node)}`];
    }
    return [`${prefix}${node.open}`, `${indentation(depth + 1)}${trimmedText}`, `${prefix}${node.close}`];
  }

  if (hasSignificantText(node)) {
    return [`${prefix}${renderInline(node)}`];
  }

  const lines = [`${prefix}${node.open}`];
  for (const child of node.children) {
    if (child.kind === "text") {
      continue;
    }
    if (child.kind === "element") {
      lines.push(...formatElement(child, depth + 1, false));
    } else {
      lines.push(`${indentation(depth + 1)}${child.raw}`);
    }
  }
  lines.push(`${prefix}${node.close}`);
  return lines;
}

function stripTrailingWhitespace(value: string): string {
  return value.replace(/[ \t]+$/gm, "");
}

function getTrailingLineBreak(value: string): string {
  const match = value.match(/(?:\r\n|\r|\n)$/);
  return match?.[0] ?? "";
}

function preserveTrailingLineBreak(formatted: string, source: string): string {
  const trailingLineBreak = getTrailingLineBreak(source);
  if (trailingLineBreak === "") {
    return formatted;
  }

  return `${formatted.replace(/(?:\r\n|\r|\n)+$/, "")}${trailingLineBreak}`;
}

function renderDocument(document: XmlDocument): string {
  const lines: string[] = [];

  for (const child of document.children) {
    if (child.kind === "text") {
      continue;
    }
    if (child.kind === "element") {
      lines.push(...formatElement(child, 0, child === document.root));
    } else {
      lines.push(child.raw);
    }
  }

  return stripTrailingWhitespace(lines.join("\n")).trim();
}

export function formatXml(xml: string): string {
  const source = xml.trim();
  if (source === "") {
    return "";
  }

  try {
    return preserveTrailingLineBreak(renderDocument(parseXml(source)), xml);
  } catch {
    return xml;
  }
}

function unwrapFormattedFragment(formatted: string): string | undefined {
  const opening = `<${FRAGMENT_ROOT}>`;
  const closing = `</${FRAGMENT_ROOT}>`;

  if (!formatted.startsWith(opening) || !formatted.endsWith(closing)) {
    return undefined;
  }

  if (formatted === `${opening}${closing}`) {
    return "";
  }

  const multilineOpening = `${opening}\n`;
  const multilineClosing = `\n${closing}`;
  if (formatted.startsWith(multilineOpening) && formatted.endsWith(multilineClosing)) {
    const content = formatted.slice(multilineOpening.length, -multilineClosing.length);
    return content
      .split("\n")
      .map((line) => (line.startsWith(INDENT) ? line.slice(INDENT.length) : line))
      .join("\n");
  }

  return formatted.slice(opening.length, -closing.length);
}

export function formatXmlFragment(xml: string): string {
  const source = xml.trim();
  if (source === "") {
    return "";
  }

  const wrapped = `<${FRAGMENT_ROOT}>${source}</${FRAGMENT_ROOT}>`;
  let formatted: string;
  try {
    formatted = renderDocument(parseXml(wrapped));
  } catch {
    return xml;
  }

  return preserveTrailingLineBreak(unwrapFormattedFragment(formatted) ?? xml, xml);
}
