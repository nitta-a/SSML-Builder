import type { Monaco, OnMount } from "@monaco-editor/react";
import { validateSsml } from "@ssml-builder-js/ssml-core";

const EDITABLE_SSML_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SSML_SUFFIX = "</speak>";

export const SSML_DIAGNOSTIC_OWNER = "ssml";

type MonacoEditor = Parameters<OnMount>[0];
export type MonacoModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;

export interface SsmlSyntaxError {
  message: string;
  offset: number;
}

export function validateSsmlText(value: string): SsmlSyntaxError | null {
  if (!value.includes("<")) {
    return null;
  }

  const source = `${EDITABLE_SSML_PREFIX}${value}${EDITABLE_SSML_SUFFIX}`;
  const validationError = validateSsml(source);
  if (!validationError) {
    return null;
  }

  return {
    message: validationError.message,
    offset: Math.min(Math.max(validationError.position - EDITABLE_SSML_PREFIX.length, 0), value.length),
  };
}

export function clearSsmlDiagnostics(monaco: Monaco, model: MonacoModel): void {
  monaco.editor.setModelMarkers(model, SSML_DIAGNOSTIC_OWNER, []);
}

export function updateSsmlDiagnostics(monaco: Monaco, model: MonacoModel): SsmlSyntaxError | null {
  const value = model.getValue();
  const syntaxError = validateSsmlText(value);
  if (!syntaxError) {
    clearSsmlDiagnostics(monaco, model);
    return null;
  }

  const startOffset = Math.max(0, Math.min(syntaxError.offset, value.length - 1));
  const endOffset = Math.min(startOffset + 1, value.length);
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);

  monaco.editor.setModelMarkers(model, SSML_DIAGNOSTIC_OWNER, [
    {
      message: syntaxError.message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
  ]);
  return syntaxError;
}
