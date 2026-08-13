import type { Monaco } from "@monaco-editor/react";
import { SSML_DIAGNOSTIC_CODES } from "./ssmlDiagnostics";

type MonacoLanguages = Monaco["languages"];
type MonacoCodeActionProvider = Parameters<MonacoLanguages["registerCodeActionProvider"]>[1];
type MonacoCodeActionMethod = NonNullable<MonacoCodeActionProvider["provideCodeActions"]>;
type MonacoCodeActionModel = Parameters<MonacoCodeActionMethod>[0];
type MonacoCodeActionContext = Parameters<MonacoCodeActionMethod>[2];

const MISSING_TIME_UNIT_ACTION_TITLE = '単位 "ms" を付与して修復';

function createMissingTimeUnitAction(model: MonacoCodeActionModel, marker: MonacoCodeActionContext["markers"][number]) {
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

export function registerSsmlCodeActions(
  monaco: Monaco,
): ReturnType<MonacoLanguages["registerCodeActionProvider"]> {
  const provider: MonacoCodeActionProvider = {
    provideCodeActions(model, _range, context) {
      const actions = context.markers
        .filter((marker) => marker.code === SSML_DIAGNOSTIC_CODES.MISSING_TIME_UNIT)
        .map((marker) => createMissingTimeUnitAction(model, marker));

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
