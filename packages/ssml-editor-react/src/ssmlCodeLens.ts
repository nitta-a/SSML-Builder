import type { Monaco } from "@monaco-editor/react";
import type { MonacoEditor } from "./ssmlDiagnostics";
import type { SsmlTagRange } from "./ssmlContext";

export type SsmlCodeLensAction =
  | {
      type: "attribute";
      insertionId: "rate" | "pitch" | "break" | "mstts:audioduration";
      attributeName: "rate" | "pitch" | "time" | "value";
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

function getTagRange(start: number, end: number): SsmlTagRange {
  return { start, end };
}

function getElementEnd(source: string, tagName: string, tagEnd: number): number {
  const openingTag = source.slice(0, tagEnd + 1);
  if (/\/\s*>$/.test(openingTag)) {
    return tagEnd + 1;
  }

  let depth = 1;
  let index = tagEnd + 1;
  while (index < source.length) {
    const nextStart = source.indexOf("<", index);
    if (nextStart === -1) {
      break;
    }
    if (source.startsWith("<!--", nextStart)) {
      index = source.indexOf("-->", nextStart + 4);
      index = index === -1 ? source.length : index + 3;
      continue;
    }
    const nextEnd = findTagEnd(source, nextStart);
    if (nextEnd === -1) {
      break;
    }
    const nextTag = source.slice(nextStart, nextEnd + 1);
    const closingMatch = nextTag.match(/^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
    const openingMatch = nextTag.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (closingMatch?.[1]?.toLowerCase() === tagName) {
      depth -= 1;
      if (depth === 0) {
        return nextEnd + 1;
      }
    } else if (openingMatch?.[1]?.toLowerCase() === tagName && !/\/\s*>$/.test(nextTag)) {
      depth += 1;
    }
    index = nextEnd + 1;
  }
  return tagEnd + 1;
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
    provideCodeLenses(model: MonacoCodeLensModel) {
      const source = model.getValue();
      const lenses: MonacoCodeLens[] = [];
      let index = 0;

      while (index < source.length) {
        const tagStart = source.indexOf("<", index);
        if (tagStart === -1) {
          break;
        }
        if (source.startsWith("<!--", tagStart)) {
          index = source.indexOf("-->", tagStart + 4);
          index = index === -1 ? source.length : index + 3;
          continue;
        }
        const tagEnd = findTagEnd(source, tagStart);
        if (tagEnd === -1) {
          break;
        }
        const tag = source.slice(tagStart, tagEnd + 1);
        const tagName = tag.match(/^<\s*(prosody|break|mstts:audioduration)\b/i)?.[1]?.toLowerCase();
        index = tagEnd + 1;
        if (!tagName) {
          continue;
        }

        const tagRange = getTagRange(tagStart, tagEnd + 1);
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
        } else if (tagName === "mstts:audioduration" && /\/\s*>$/.test(tag)) {
          lenses.push(
            createLens(
              model,
              tagStart,
              tagEnd + 1,
              `⚡ Duration: ${getAttributeValue(tag, "value") ?? "default"} (Click to edit)`,
              { type: "attribute", insertionId: "mstts:audioduration", attributeName: "value", tagRange },
            ),
            createLens(model, tagStart, tagEnd + 1, "Delete", {
              type: "delete",
              tagRange,
              elementRange,
            }),
          );
        } else if (tagName === "break" && /\/\s*>$/.test(tag)) {
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
  const commandHandler = (_accessor: unknown, ...args: unknown[]) => {
    const action = args[0];
    if (action && typeof action === "object" && "type" in action) {
      onOpenPopover(action as SsmlCodeLensAction);
    }
  };

  const commandDisposable =
    typeof monaco.editor?.registerCommand === "function"
      ? monaco.editor.registerCommand(CODE_LENS_COMMAND, commandHandler)
      : typeof monaco.registerCommand === "function"
        ? monaco.registerCommand(CODE_LENS_COMMAND, commandHandler)
        : editor.addAction({
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
      commandDisposable.dispose();
      disposable.dispose();
    },
  };
}
