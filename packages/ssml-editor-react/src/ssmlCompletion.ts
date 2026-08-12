import type { Monaco } from "@monaco-editor/react";

type MonacoLanguages = Monaco["languages"];
type MonacoCompletionProvider = Parameters<MonacoLanguages["registerCompletionItemProvider"]>[1];

const SSML_COMPLETION_SNIPPETS = [
  {
    label: "break",
    insertText: '<break time="500ms" />',
  },
  {
    label: "prosody",
    insertText: '<prosody rate="medium" pitch="medium">${1:text}</prosody>',
  },
  {
    label: "mstts:express-as",
    insertText: '<mstts:express-as style="cheerful">${1:text}</mstts:express-as>',
  },
  {
    label: "sub",
    insertText: '<sub alias="${1:読み}">${2:漢字}</sub>',
  },
] as const;

export function registerSsmlCompletionProvider(monaco: Monaco): ReturnType<MonacoLanguages["registerCompletionItemProvider"]> {
  const provider: MonacoCompletionProvider = {
    provideCompletionItems() {
      return {
        suggestions: SSML_COMPLETION_SNIPPETS.map(({ label, insertText }) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        })),
      };
    },
  };

  return monaco.languages.registerCompletionItemProvider("xml", provider);
}
