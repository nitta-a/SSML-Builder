import type { Monaco, OnMount } from "@monaco-editor/react";
import { validateSsml } from "@ssml-builder-js/ssml-core";
import { SSML_ATTRIBUTE_PRESETS } from "./constants/ssmlPresets";

const EDITABLE_SSML_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SSML_SUFFIX = "</speak>";

export const SSML_DIAGNOSTIC_OWNER = "ssml";

export const SSML_DIAGNOSTIC_CODES = {
  INVALID_ATTR_VALUE: "INVALID_ATTR_VALUE",
  MISSING_TIME_UNIT: "MISSING_TIME_UNIT",
  SYNTAX_ERROR: "SSML_SYNTAX_ERROR",
  UNCLOSED_TAG: "UNCLOSED_TAG",
} as const;

export type SsmlDiagnosticCode = (typeof SSML_DIAGNOSTIC_CODES)[keyof typeof SSML_DIAGNOSTIC_CODES];

export type SsmlDiagnosticMarkerCode =
  | {
      value: typeof SSML_DIAGNOSTIC_CODES.INVALID_ATTR_VALUE;
      suggestedValue: string;
    }
  | {
      value: typeof SSML_DIAGNOSTIC_CODES.UNCLOSED_TAG;
      target: string;
    };

export type MonacoEditor = Parameters<OnMount>[0];
export type MonacoModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;

export interface SsmlSyntaxError {
  code: SsmlDiagnosticCode | SsmlDiagnosticMarkerCode;
  length?: number;
  message: string;
  offset: number;
}

const MISSING_TIME_UNIT_PATTERN = /<break\b[^>]*?\s+time\s*=\s*(["'])(\s*)(\d+(?:\.\d+)?)(\s*)\1/i;
const OPEN_TAG_PATTERN = /<([A-Za-z_][A-Za-z0-9_.:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTRIBUTE_PATTERN = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
const UNCLOSED_TAG_MESSAGE_PATTERN = /^(?:Unclosed XML element: <([^>]+)>|Mismatched closing element: expected <\/([^>]+)> but found <\/speak>)$/;

function getSsmlAttributePresets(tagName: string, attributeName: string): readonly string[] | undefined {
  const tagPresets = Object.entries(SSML_ATTRIBUTE_PRESETS).find(
    ([presetTagName]) => presetTagName.toLowerCase() === tagName.toLowerCase(),
  )?.[1];

  return Object.entries(tagPresets ?? {}).find(
    ([presetAttributeName]) => presetAttributeName.toLowerCase() === attributeName.toLowerCase(),
  )?.[1];
}

function findInvalidAttribute(value: string): {
  attributeName: string;
  attributeValue: string;
  offset: number;
  suggestedValue: string;
  tagName: string;
} | null {
  for (const tagMatch of value.matchAll(OPEN_TAG_PATTERN)) {
    const tagName = tagMatch[1];
    const tagContent = tagMatch[2];
    if (!tagName || tagContent === undefined) {
      continue;
    }

    for (const attributeMatch of tagContent.matchAll(ATTRIBUTE_PATTERN)) {
      const attributeName = attributeMatch[1];
      const quote = attributeMatch[2];
      const attributeValue = attributeMatch[3];
      if (!attributeName || !quote || attributeValue === undefined) {
        continue;
      }

      const presets = getSsmlAttributePresets(tagName, attributeName);
      if (!presets || presets.includes(attributeValue)) {
        continue;
      }

      const suggestedValue = presets.includes("x-fast") ? "x-fast" : presets[0];
      if (!suggestedValue) {
        continue;
      }

      const attributeOffset = attributeMatch.index ?? 0;
      const quoteOffset = attributeMatch[0].indexOf(quote);
      return {
        attributeName,
        attributeValue,
        offset: (tagMatch.index ?? 0) + 1 + tagName.length + attributeOffset + quoteOffset + 1,
        suggestedValue,
        tagName,
      };
    }
  }

  return null;
}

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

    const invalidAttribute = findInvalidAttribute(value);
    if (invalidAttribute) {
      return {
        code: {
          value: SSML_DIAGNOSTIC_CODES.INVALID_ATTR_VALUE,
          suggestedValue: invalidAttribute.suggestedValue,
        },
        length: invalidAttribute.attributeValue.length,
        message: `Invalid value "${invalidAttribute.attributeValue}" for ${invalidAttribute.tagName} attribute "${invalidAttribute.attributeName}"`,
        offset: invalidAttribute.offset,
      };
    }

    return null;
  }

  const unclosedTagMatch = UNCLOSED_TAG_MESSAGE_PATTERN.exec(validationError.message);
  const unclosedTag = unclosedTagMatch?.[1] ?? unclosedTagMatch?.[2];
  if (unclosedTag) {
    return {
      code: {
        value: SSML_DIAGNOSTIC_CODES.UNCLOSED_TAG,
        target: unclosedTag,
      },
      message: `Unclosed XML element: <${unclosedTag}>`,
      offset: value.length,
    };
  }

  return {
    code: SSML_DIAGNOSTIC_CODES.SYNTAX_ERROR,
    message: validationError.message,
    offset: Math.min(Math.max(validationError.position - EDITABLE_SSML_PREFIX.length, 0), value.length),
  };
}

type MonacoMarkerData = Parameters<Monaco["editor"]["setModelMarkers"]>[2][number];

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
      code: syntaxError.code as unknown as MonacoMarkerData["code"],
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
  ]);
  return syntaxError;
}
