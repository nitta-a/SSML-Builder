import type * as monaco from "monaco-editor";
// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import { resolveExpressAsStyles, SSML_ATTRIBUTE_PRESETS } from "./constants/ssmlPresets.ts";
// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import { findSsmlVoiceContext } from "./ssmlContext.ts";

type Monaco = typeof monaco;
type MonacoLanguages = Monaco["languages"];
type MonacoCompletionProvider = Parameters<MonacoLanguages["registerCompletionItemProvider"]>[1];
type MonacoCompletionMethod = NonNullable<MonacoCompletionProvider["provideCompletionItems"]>;
type MonacoCompletionModel = Parameters<MonacoCompletionMethod>[0];
type MonacoCompletionPosition = Parameters<MonacoCompletionMethod>[1];

const SSML_ATTRIBUTE_VALUE_PATTERN = /<([\w:-]+)\s+[^>]*?\b([\w:-]+)=["']([^"']*)$/i;
const EXPRESS_AS_TAG_NAMES = new Set(["mstts:express-as", "express-as", "expressas"]);

export interface SsmlCompletionProviderOptions {
  getOuterVoiceName?: () => string | undefined;
  model?: MonacoCompletionModel | null;
}

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
    label: "mstts:audioduration",
    insertText: '<mstts:audioduration value="10s" />',
  },
  {
    label: "mstts:dialog",
    insertText: `<mstts:dialog>\n  <mstts:turn voice="\${1:en-US-JennyNeural}">\${2:text}</mstts:turn>\n</mstts:dialog>`,
  },
  {
    label: "mstts:turn",
    insertText: `<mstts:turn voice="\${1:en-US-JennyNeural}">\${2:text}</mstts:turn>`,
  },
  {
    label: "mstts:backgroundaudio",
    insertText: `<mstts:backgroundaudio src="\${1:https://example.com/audio.mp3}" volume="\${2:70}" fadein="\${3:1000}" fadeout="\${4:1000}" />`,
  },
  {
    label: "mstts:ttsembedding",
    insertText: `<mstts:ttsembedding>\${1:text}</mstts:ttsembedding>`,
  },
  {
    label: "sub",
    insertText: `<sub alias="\${1:読み}">\${2:漢字}</sub>`,
  },
] as const;

export function registerSsmlCompletionProvider(
  monaco: Monaco,
  options: SsmlCompletionProviderOptions = {},
): ReturnType<MonacoLanguages["registerCompletionItemProvider"]> {
  const provider: MonacoCompletionProvider = {
    provideCompletionItems(model: MonacoCompletionModel, position: MonacoCompletionPosition) {
      if (options.model && options.model !== model) {
        return { suggestions: [] };
      }

      const value = model.getValue();
      const offset = model.getOffsetAt(position);
      const textUntilPosition = value.slice(0, offset);
      const isClosingTag = /<\/[a-zA-Z0-9:-]*$/.test(textUntilPosition);
      if (isClosingTag) {
        return { suggestions: [] };
      }

      const attributeMatch = SSML_ATTRIBUTE_VALUE_PATTERN.exec(textUntilPosition);
      let attributeValues = attributeMatch ? findSsmlAttributePresets(attributeMatch[1], attributeMatch[2]) : undefined;
      if (
        attributeMatch &&
        attributeValues &&
        EXPRESS_AS_TAG_NAMES.has(attributeMatch[1].toLowerCase()) &&
        attributeMatch[2].toLowerCase() === "style"
      ) {
        const voiceContext = findSsmlVoiceContext(value, offset);
        const voiceName = voiceContext === undefined ? options.getOuterVoiceName?.() : voiceContext.voiceName;
        attributeValues = resolveExpressAsStyles(voiceName, attributeValues);
      }
      const openTagMatch = textUntilPosition.match(/<(?!\/)[a-zA-Z0-9:-]*$/);
      const openTagLength = openTagMatch?.[0].length ?? 0;
      const isAfterBracket =
        model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column - 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        }) === "<";
      const hasClosingBracket =
        isAfterBracket &&
        model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column + 1,
        }) === ">";
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: openTagLength > 0 ? position.column - openTagLength : position.column,
        endLineNumber: position.lineNumber,
        endColumn: hasClosingBracket ? position.column + 1 : position.column,
      };

      return {
        suggestions: [
          ...(attributeMatch
            ? []
            : SSML_COMPLETION_SNIPPETS.map(({ label, insertText }) => ({
                label,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
              }))),
          ...(attributeValues?.map((value) => ({
            label: value,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: value,
            range,
          })) ?? []),
        ],
      };
    },
    triggerCharacters: ["<", '"', "'"],
  };

  return monaco.languages.registerCompletionItemProvider("xml", provider);
}
