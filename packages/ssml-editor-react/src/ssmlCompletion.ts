import type { Monaco } from "@monaco-editor/react";
import { SSML_ATTRIBUTE_PRESETS } from "./constants/ssmlPresets";

type MonacoLanguages = Monaco["languages"];
type MonacoCompletionProvider = Parameters<MonacoLanguages["registerCompletionItemProvider"]>[1];
type MonacoCompletionMethod = NonNullable<MonacoCompletionProvider["provideCompletionItems"]>;
type MonacoCompletionModel = Parameters<MonacoCompletionMethod>[0];
type MonacoCompletionPosition = Parameters<MonacoCompletionMethod>[1];

const SSML_ATTRIBUTE_VALUE_PATTERN = /<([\w:-]+)\s+[^>]*?\b([\w:-]+)=["']([^"']*)$/i;

function findSsmlAttributePresets(tagName: string, attributeName: string): readonly string[] | undefined {
  const tagPresets = Object.entries(SSML_ATTRIBUTE_PRESETS).find(
    ([presetTagName]) => presetTagName.toLowerCase() === tagName.toLowerCase(),
  )?.[1];

  return Object.entries(tagPresets ?? {}).find(
    ([presetAttributeName]) => presetAttributeName.toLowerCase() === attributeName.toLowerCase(),
  )?.[1];
}

const SSML_COMPLETION_SNIPPETS = [
  {
    label: "break",
    insertText: '<break time="500ms" />',
  },
  {
    label: "prosody",
    insertText: `<prosody rate="medium" pitch="medium">\${1:text}</prosody>`,
  },
  {
    label: "mstts:express-as",
    insertText: `<mstts:express-as style="cheerful">\${1:text}</mstts:express-as>`,
  },
  {
    label: "sub",
    insertText: `<sub alias="\${1:読み}">\${2:漢字}</sub>`,
  },
] as const;

export function registerSsmlCompletionProvider(
  monaco: Monaco,
): ReturnType<MonacoLanguages["registerCompletionItemProvider"]> {
  const provider: MonacoCompletionProvider = {
    provideCompletionItems(model: MonacoCompletionModel, position: MonacoCompletionPosition) {
      const textBeforeCursor = model.getValue().slice(0, model.getOffsetAt(position));
      const attributeMatch = SSML_ATTRIBUTE_VALUE_PATTERN.exec(textBeforeCursor);
      const attributeValues = attributeMatch
        ? findSsmlAttributePresets(attributeMatch[1], attributeMatch[2])
        : undefined;

      return {
        suggestions: [
          ...SSML_COMPLETION_SNIPPETS.map(({ label, insertText }) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          })),
          ...(attributeValues?.map((value) => ({
            label: value,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: value,
          })) ?? []),
        ],
      };
    },
    triggerCharacters: ["<", '"', "'"],
  };

  return monaco.languages.registerCompletionItemProvider("xml", provider);
}
