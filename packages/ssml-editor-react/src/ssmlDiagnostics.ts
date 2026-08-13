import type { Monaco, OnMount } from "@monaco-editor/react";
import { validateSsml } from "@ssml-builder-js/ssml-core";

const EDITABLE_SSML_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SSML_SUFFIX = "</speak>";

export const SSML_DIAGNOSTIC_OWNER = "ssml";

export const SSML_DIAGNOSTIC_CODES = {
  MISSING_TIME_UNIT: "MISSING_TIME_UNIT",
  SYNTAX_ERROR: "SSML_SYNTAX_ERROR",
} as const;

export type SsmlDiagnosticCode = (typeof SSML_DIAGNOSTIC_CODES)[keyof typeof SSML_DIAGNOSTIC_CODES];

export type MonacoEditor = Parameters<OnMount>[0];
export type MonacoModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;

export interface SsmlSyntaxError {
  code: SsmlDiagnosticCode;
  length?: number;
  message: string;
  offset: number;
}

const MISSING_TIME_UNIT_PATTERN = /<break\b[^>]*?\s+time\s*=\s*(["'])(\s*)(\d+(?:\.\d+)?)(\s*)\1/i;

export function validateSsmlText(value: string): SsmlSyntaxError | null {
  if (!value.includes("<")) {
    return null;
  }

  const source = `${EDITABLE_SSML_PREFIX}${value}${EDITABLE_SSML_SUFFIX}`;
  const validationError = validateSsml(source);
  if (!validationError) {
    const missingTimeUnit = MISSING_TIME_UNIT_PATTERN.exec(value);
    if (missingTimeUnit) {
      const numericValue = missingTimeUnit[3];
      const offset =
        (missingTimeUnit.index ?? 0) + missingTimeUnit[0].length - 1 - missingTimeUnit[4].length - numericValue.length;

      return {
        code: SSML_DIAGNOSTIC_CODES.MISSING_TIME_UNIT,
        length: numericValue.length,
        message: 'SSML time values must include a unit ("ms" or "s")',
        offset,
      };
    }

    return null;
  }

  return {
    code: SSML_DIAGNOSTIC_CODES.SYNTAX_ERROR,
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

  const startOffset = value.length === 0 ? 0 : Math.min(syntaxError.offset, value.length - 1);
  const endOffset = Math.min(startOffset + (syntaxError.length ?? 1), value.length);
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);

  monaco.editor.setModelMarkers(model, SSML_DIAGNOSTIC_OWNER, [
    {
      message: syntaxError.message,
      severity: monaco.MarkerSeverity.Error,
      code: syntaxError.code,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
  ]);
  return syntaxError;
}
