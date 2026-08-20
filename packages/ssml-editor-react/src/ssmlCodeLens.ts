import type { Monaco } from "@monaco-editor/react";
import type { MonacoEditor, MonacoModel } from "./ssmlDiagnostics";
import type { SsmlTagRange } from "./ssmlContext";

export type SsmlCodeLensAction =
  | {
      type: "attribute";
      insertionId: "rate" | "pitch" | "break";
      attributeName: "rate" | "pitch" | "time";
      tagRange: SsmlTagRange;
    }
  | {
      type: "unwrap" | "delete";
      tagRange: SsmlTagRange;
      elementRange: SsmlTagRange;
    };

export type SsmlCodeLensCallback = (action: SsmlCodeLensAction) => void;

type MonacoCodeLensProvider = Parameters<Monaco["languages"]["registerCodeLensProvider"]>[1];
type MonacoCodeLensModel = Parameters<NonNullable<MonacoCodeLensProvider["provideCodeLenses"]>>[0];
type MonacoCodeLens = NonNullable<
  Awaited<ReturnType<NonNullable<MonacoCodeLensProvider["provideCodeLenses"]>>>
>["lenses"][number];

const CODE_LENS_COMMAND = "ssml-editor.codeLens";

function findTagEnd(source: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function getAttributeValue(tag: string, attributeName: string): string | undefined {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2];
}

function getTagRange(model: MonacoModel, start: number, end: number): SsmlTagRange {
  return { start, end };
}

function getElementEnd(source: string, tagName: string, tagEnd: number): number {
  const openingTag = source.slice(0, tagEnd + 1);
  if (/\/\s*>$/.test(openingTag)) {
    return tagEnd + 1;
  }

  const closingPattern = new RegExp(`<\\/\\s*${tagName}\\s*>`, "gi");
  closingPattern.lastIndex = tagEnd + 1;
  const closingMatch = closingPattern.exec(source);
  return closingMatch ? closingMatch.index + closingMatch[0].length : tagEnd + 1;
}

function createLens(
  model: MonacoCodeLensModel,
  start: number,
  end: number,
  title: string,
  action: SsmlCodeLensAction,
): MonacoCodeLens {
  const startPosition = model.getPositionAt(start);
  const endPosition = model.getPositionAt(end);
  return {
    range: {
      startLineNumber: startPosition.lineNumber,
      startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber,
      endColumn: endPosition.column,
    },
    command: {
      id: CODE_LENS_COMMAND,
      title,
      arguments: [action],
    },
  };
}

export function registerSsmlCodeLens(
  monaco: Monaco,
  editor: MonacoEditor,
  onOpenPopover: SsmlCodeLensCallback,
): ReturnType<Monaco["languages"]["registerCodeLensProvider"]> {
  const provider: MonacoCodeLensProvider = {
    provideCodeLenses(model) {
      const source = model.getValue();
      const lenses: MonacoCodeLens[] = [];
      const tagPattern = /<(prosody|break)\b/gi;

      for (const match of source.matchAll(tagPattern)) {
        const tagStart = match.index ?? 0;
        const tagEnd = findTagEnd(source, tagStart);
        const tagName = match[1]?.toLowerCase();
        if (tagEnd === -1 || !tagName) {
          continue;
        }

        const tagRange = getTagRange(model, tagStart, tagEnd + 1);
        const tag = source.slice(tagStart, tagEnd + 1);
        const elementEnd = getElementEnd(source, tagName, tagEnd);
        const elementRange = { start: tagStart, end: elementEnd };

        if (tagName === "prosody") {
          lenses.push(
            createLens(
              model,
              tagStart,
              tagEnd + 1,
              `⚡ Rate: ${getAttributeValue(tag, "rate") ?? "default"} (Click to edit)`,
              { type: "attribute", insertionId: "rate", attributeName: "rate", tagRange },
            ),
            createLens(
              model,
              tagStart,
              tagEnd + 1,
              `⚡ Pitch: ${getAttributeValue(tag, "pitch") ?? "default"} (Click to edit)`,
              { type: "attribute", insertionId: "pitch", attributeName: "pitch", tagRange },
            ),
            createLens(model, tagStart, tagEnd + 1, "Unwrap", {
              type: "unwrap",
              tagRange,
              elementRange,
            }),
          );
        } else if (/\/\s*>$/.test(tag)) {
          lenses.push(
            createLens(
              model,
              tagStart,
              tagEnd + 1,
              `⚡ Time: ${getAttributeValue(tag, "time") ?? "default"} (Click to edit)`,
              { type: "attribute", insertionId: "break", attributeName: "time", tagRange },
            ),
            createLens(model, tagStart, tagEnd + 1, "Delete", {
              type: "delete",
              tagRange,
              elementRange,
            }),
          );
        }
      }

      return { lenses, dispose: () => undefined };
    },
  };

  const disposable = monaco.languages.registerCodeLensProvider("xml", provider);
  const actionDisposable = editor.addAction({
    id: CODE_LENS_COMMAND,
    label: "SSML CodeLens",
    run: (_editor, ...args: unknown[]) => {
      const action = args[0];
      if (action && typeof action === "object" && "type" in action) {
        onOpenPopover(action as SsmlCodeLensAction);
      }
    },
  });

  return {
    dispose: () => {
      actionDisposable.dispose();
      disposable.dispose();
    },
  };
}
