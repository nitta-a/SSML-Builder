import type { Monaco } from "@monaco-editor/react";
import { SSML_DIAGNOSTIC_CODES } from "./ssmlDiagnostics";

type MonacoLanguages = Monaco["languages"];
type MonacoCodeActionProvider = Parameters<MonacoLanguages["registerCodeActionProvider"]>[1];
type MonacoCodeActionMethod = NonNullable<MonacoCodeActionProvider["provideCodeActions"]>;
type MonacoCodeActionModel = Parameters<MonacoCodeActionMethod>[0];
type MonacoCodeActionRange = Parameters<MonacoCodeActionMethod>[1];
type MonacoCodeActionContext = Parameters<MonacoCodeActionMethod>[2];
type MonacoCodeActionMarker = MonacoCodeActionContext["markers"][number];

const MISSING_TIME_UNIT_ACTION_TITLE = '単位 "ms" を付与して修復';

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

export function registerSsmlCodeActions(monaco: Monaco): ReturnType<MonacoLanguages["registerCodeActionProvider"]> {
  const provider: MonacoCodeActionProvider = {
    provideCodeActions(
      model: MonacoCodeActionModel,
      _range: MonacoCodeActionRange,
      context: MonacoCodeActionContext,
    ): ReturnType<MonacoCodeActionMethod> {
      const actions = context.markers
        .filter((marker: MonacoCodeActionMarker) => marker.code === SSML_DIAGNOSTIC_CODES.MISSING_TIME_UNIT)
        .map((marker: MonacoCodeActionMarker) => createMissingTimeUnitAction(model, marker));

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
