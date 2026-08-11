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
): SsmlInsertionEdit {
  const selectedText = source.slice(startOffset, endOffset);

  if (template.mode === SSML_INSERTION_MODES.wrap) {
    return {
      replacement: `${template.prefix}${selectedText}${template.suffix}`,
      selectionOffset: template.prefix.length,
    };
  }

  const leadingLineBreak = !isLineStart(source, startOffset) && !startsWithLineBreak(template.prefix) ? "\n" : "";
  const needsTrailingLineBreak =
    selectedText.length > 0
      ? !selectedText.startsWith("\n") && !selectedText.startsWith("\r")
      : !isLineEnd(source, endOffset);
  const trailingLineBreak = needsTrailingLineBreak && !endsWithLineBreak(template.prefix) ? "\n" : "";
  const insertionPrefix = `${leadingLineBreak}${template.prefix}`;

  return {
    replacement: `${insertionPrefix}${trailingLineBreak}${selectedText}`,
    selectionOffset: insertionPrefix.length + (selectedText.length > 0 ? trailingLineBreak.length : 0),
  };
}
