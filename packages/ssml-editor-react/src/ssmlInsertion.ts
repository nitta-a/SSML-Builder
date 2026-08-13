// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import { SSML_INSERTION_MODES } from "./constants/ui.ts";

export type SsmlInsertionMode = (typeof SSML_INSERTION_MODES)[keyof typeof SSML_INSERTION_MODES];

export interface SsmlInsertionTemplate {
  prefix: string;
  suffix: string;
  mode: SsmlInsertionMode;
}

export interface SsmlInsertionEdit {
  replacement: string;
  selectionOffset: number;
}

function isLineStart(value: string, offset: number): boolean {
  return offset === 0 || value[offset - 1] === "\n" || value[offset - 1] === "\r";
}

function isLineEnd(value: string, offset: number): boolean {
  return offset === value.length || value[offset] === "\n" || value[offset] === "\r";
}

function getLineBreakAt(value: string, offset: number): string {
  if (value.startsWith("\r\n", offset)) {
    return "\r\n";
  }
  if (value[offset] === "\n" || value[offset] === "\r") {
    return value[offset];
  }
  return "";
}

function startsWithLineBreak(value: string): boolean {
  return value.startsWith("\n") || value.startsWith("\r");
}

function endsWithLineBreak(value: string): boolean {
  return value.endsWith("\n") || value.endsWith("\r");
}

export function createSsmlInsertionEdit(
  source: string,
  startOffset: number,
  endOffset: number,
  template: SsmlInsertionTemplate,
  eol = "\n",
  selectedText = source.slice(startOffset, endOffset),
): SsmlInsertionEdit {
  if (template.mode === SSML_INSERTION_MODES.wrap) {
    const trailingLineBreak = getLineBreakAt(source, endOffset) === "" ? eol : "";
    return {
      replacement: `${template.prefix}${selectedText}${template.suffix}${trailingLineBreak}`,
      selectionOffset: template.prefix.length,
    };
  }

  const followingLineBreak = getLineBreakAt(source, endOffset);
  const leadingLineBreak = !isLineStart(source, startOffset) && !startsWithLineBreak(template.prefix) ? eol : "";
  const needsTrailingLineBreak =
    selectedText.length > 0
      ? !selectedText.startsWith("\n") && !selectedText.startsWith("\r")
      : !isLineEnd(source, endOffset) || followingLineBreak === "";
  const trailingLineBreak = needsTrailingLineBreak && !endsWithLineBreak(template.prefix) ? eol : "";
  const insertionPrefix = `${leadingLineBreak}${template.prefix}`;

  return {
    replacement: `${insertionPrefix}${trailingLineBreak}${selectedText}`,
    selectionOffset:
      insertionPrefix.length +
      trailingLineBreak.length +
      (selectedText.length === 0 && trailingLineBreak === "" ? followingLineBreak.length : 0),
  };
}
