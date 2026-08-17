import type { Monaco } from "@monaco-editor/react";
import { SSML_DIAGNOSTIC_CODES } from "./ssmlDiagnostics";
import { getEnclosingTagRange } from "./ssmlContext";

type MonacoLanguages = Monaco["languages"];
type MonacoCodeActionProvider = Parameters<MonacoLanguages["registerCodeActionProvider"]>[1];
type MonacoCodeActionMethod = NonNullable<MonacoCodeActionProvider["provideCodeActions"]>;
type MonacoCodeActionModel = Parameters<MonacoCodeActionMethod>[0];
type MonacoCodeActionRange = Parameters<MonacoCodeActionMethod>[1];
type MonacoCodeActionContext = Parameters<MonacoCodeActionMethod>[2];
type MonacoCodeActionMarker = MonacoCodeActionContext["markers"][number];

const MISSING_TIME_UNIT_ACTION_TITLE = '単位 "ms" を付与して修復';

interface StructuredMarkerCode {
  suggestedValue?: unknown;
  target?: unknown;
  value?: unknown;
}

function getStructuredMarkerCode(marker: MonacoCodeActionMarker): StructuredMarkerCode | undefined {
  return typeof marker.code === "object" && marker.code !== null
    ? (marker.code as unknown as StructuredMarkerCode)
    : undefined;
}

function createMissingTimeUnitAction(model: MonacoCodeActionModel, marker: MonacoCodeActionMarker) {
  return {
    title: MISSING_TIME_UNIT_ACTION_TITLE,
    kind: "quickfix",
    isPreferred: true,
    diagnostics: [marker],
    edit: {
      edits: [
        {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: {
              startLineNumber: marker.startLineNumber,
              startColumn: marker.startColumn,
              endLineNumber: marker.endLineNumber,
              endColumn: marker.endColumn,
            },
            text: `${model.getValueInRange(marker)}ms`,
          },
        },
      ],
    },
  };
}

function createUnclosedTagAction(model: MonacoCodeActionModel, marker: MonacoCodeActionMarker, target: string) {
  return {
    title: `閉じタグ "</${target}>" を自動挿入`,
    kind: "quickfix",
    isPreferred: true,
    diagnostics: [marker],
    edit: {
      edits: [
        {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: {
              startLineNumber: marker.endLineNumber,
              startColumn: marker.endColumn,
              endLineNumber: marker.endLineNumber,
              endColumn: marker.endColumn,
            },
            text: `</${target}>`,
          },
        },
      ],
    },
  };
}

function createInvalidAttributeValueAction(
  model: MonacoCodeActionModel,
  marker: MonacoCodeActionMarker,
  suggestedValue: string,
) {
  return {
    title: `"${suggestedValue}" に変更`,
    kind: "quickfix",
    isPreferred: true,
    diagnostics: [marker],
    edit: {
      edits: [
        {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: {
              startLineNumber: marker.startLineNumber,
              startColumn: marker.startColumn,
              endLineNumber: marker.endLineNumber,
              endColumn: marker.endColumn,
            },
            text: suggestedValue,
          },
        },
      ],
    },
  };
}

function toModelRange(model: MonacoCodeActionModel, startOffset: number, endOffset: number) {
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

function createUnwrapTagAction(model: MonacoCodeActionModel, tagName: string, openingStart: number, openingEnd: number, closingStart: number, closingEnd: number) {
  return {
    title: `Unwrap <${tagName}>`,
    kind: "quickfix",
    isPreferred: true,
    edit: {
      edits: [
        {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: toModelRange(model, openingStart, openingEnd),
            text: "",
          },
        },
        {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: toModelRange(model, closingStart, closingEnd),
            text: "",
          },
        },
      ],
    },
  };
}

export function registerSsmlCodeActions(monaco: Monaco): ReturnType<MonacoLanguages["registerCodeActionProvider"]> {
  const provider: MonacoCodeActionProvider = {
    provideCodeActions(
      model: MonacoCodeActionModel,
      range: MonacoCodeActionRange,
      context: MonacoCodeActionContext,
    ): ReturnType<MonacoCodeActionMethod> {
      const actions = context.markers.flatMap((marker: MonacoCodeActionMarker) => {
        if (marker.code === SSML_DIAGNOSTIC_CODES.MISSING_TIME_UNIT) {
          return [createMissingTimeUnitAction(model, marker)];
        }

        const structuredCode = getStructuredMarkerCode(marker);
        if (structuredCode?.value === SSML_DIAGNOSTIC_CODES.UNCLOSED_TAG && typeof structuredCode.target === "string") {
          return [createUnclosedTagAction(model, marker, structuredCode.target)];
        }
        if (
          structuredCode?.value === SSML_DIAGNOSTIC_CODES.INVALID_ATTR_VALUE &&
          typeof structuredCode.suggestedValue === "string"
        ) {
          return [createInvalidAttributeValueAction(model, marker, structuredCode.suggestedValue)];
        }

        return [];
      });
      if (context.markers.length === 0) {
        const offset = model.getOffsetAt({
          lineNumber: range.startLineNumber,
          column: range.startColumn,
        });
        const enclosingTag = getEnclosingTagRange(model.getValue(), offset);
        if (enclosingTag?.closingTag) {
          actions.push(
            createUnwrapTagAction(
              model,
              enclosingTag.tagName,
              enclosingTag.openingTag.start,
              enclosingTag.openingTag.end,
              enclosingTag.closingTag.start,
              enclosingTag.closingTag.end,
            ),
          );
        }
      }

      return {
        actions,
        dispose() {},
      };
    },
  };

  return monaco.languages.registerCodeActionProvider("xml", provider, {
    providedCodeActionKinds: ["quickfix"],
  });
}
