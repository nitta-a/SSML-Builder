// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import { SSML_INSERTION_MODES } from "./constants/ui.ts";
import type * as monaco from "monaco-editor";
import { MACRO_PRESETS, type MacroPresetKey } from "./constants/ssmlPresets.ts";

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
  selectedText = startOffset === endOffset ? "" : source.slice(startOffset, endOffset),
): SsmlInsertionEdit {
  if (template.mode === SSML_INSERTION_MODES.wrap) {
    const trailingLineBreak = getLineBreakAt(source, endOffset) === "" ? eol : "";
    return {
      replacement: `${template.prefix}${selectedText}${template.suffix}${trailingLineBreak}`,
      selectionOffset: template.prefix.length,
    };
  }

  export function applyMacroPreset(
    editor: monaco.editor.IStandaloneCodeEditor,
    _monaco: unknown,
    presetKey: string,
  ): boolean {
    if (!(presetKey in MACRO_PRESETS)) {
      return false;
    }

    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) {
      return false;
    }

    const template = MACRO_PRESETS[presetKey as MacroPresetKey];
    const selectedText = selection.isEmpty() ? "text" : model.getValueInRange(selection);
    const placeholderOffset = template.indexOf("${text}");
    const replacement = template.replace("${text}", selectedText);
    const startOffset = model.getOffsetAt(selection.getStartPosition());
    const endOffset = startOffset + replacement.length;
    const selectedStartOffset = startOffset + placeholderOffset;
    const selectedEndOffset = selectedStartOffset + selectedText.length;

    editor.pushUndoStop();
    const applied = editor.executeEdits("ssml-macro", [{ range: selection, text: replacement }]);
    editor.pushUndoStop();
    if (!applied) {
      return false;
    }

    const selectedStart = model.getPositionAt(selectedStartOffset);
    const selectedEnd = model.getPositionAt(selectedEndOffset);
    editor.setSelection({
      selectionStartLineNumber: selectedStart.lineNumber,
      selectionStartColumn: selectedStart.column,
      positionLineNumber: selectedEnd.lineNumber,
      positionColumn: selectedEnd.column,
    });
    editor.focus();
    return true;
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
