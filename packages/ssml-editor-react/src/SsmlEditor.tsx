import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
import type {
  ProsodyElement,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  VoiceElement,
} from "@ssml-builder/ssml-core";
import { findSsmlHoverTarget, formatSsmlHover } from "./ssmlHover";

const DEFAULT_VOICE = "en-US-JennyNeural";
const DEFAULT_PITCH = "0st";
const DEFAULT_RATE = "medium";
const DEFAULT_VOLUME = "medium";
const DEFAULT_LANGUAGE = "ja";
const RATE_OPTIONS = ["x-slow", "slow", "medium", "fast", "x-fast"] as const;
const VOLUME_OPTIONS = [
  "silent",
  "x-soft",
  "soft",
  "medium",
  "loud",
  "x-loud",
] as const;

export type SsmlEditorLanguage = "ja" | "en";

type LocalizedText = Record<SsmlEditorLanguage, string>;
type SsmlInsertionOption = {
  value: string;
  labels: LocalizedText;
};
type SsmlInsertionTemplate = {
  prefix: string;
  suffix: string;
  mode: "insert" | "wrap";
};
type SsmlInsertionDefinition = {
  id: string;
  icon: string;
  labels: LocalizedText;
  titles: LocalizedText;
  descriptions: LocalizedText;
  options: readonly SsmlInsertionOption[];
  createTemplate: (value: string) => SsmlInsertionTemplate;
};

function createInsertionOptions(
  values: readonly string[],
): readonly SsmlInsertionOption[] {
  return values.map((value) => ({
    value,
    labels: { ja: value, en: value },
  }));
}

const SSML_INSERTIONS = [
  {
    id: "break",
    icon: "⏸",
    labels: { ja: "間", en: "Break" },
    titles: {
      ja: '500msの間を挿入 (<break time="500ms"/>)',
      en: 'Insert a 500ms pause with <break time="500ms"/>',
    },
    descriptions: {
      ja: "指定した時間だけ無音の間を挿入します。",
      en: "Inserts a silent pause for the selected duration.",
    },
    options: createInsertionOptions(["500ms", "1s", "2s", "3s"]),
    createTemplate: (value) => ({
      prefix: `<break time="${value}"/>`,
      suffix: "",
      mode: "insert",
    }),
  },
  {
    id: "emphasis",
    icon: "✦",
    labels: { ja: "強調", en: "Emphasis" },
    titles: {
      ja: '選択範囲を <emphasis level="strong"> で囲む',
      en: 'Wrap the selection with <emphasis level="strong">',
    },
    descriptions: {
      ja: "選択範囲の強調レベルを変更します。",
      en: "Changes the emphasis level of the selected text.",
    },
    options: createInsertionOptions(["strong", "moderate", "reduced", "none"]),
    createTemplate: (value) => ({
      prefix: `<emphasis level="${value}">`,
      suffix: "</emphasis>",
      mode: "wrap",
    }),
  },
  {
    id: "rate",
    icon: "↕",
    labels: { ja: "速度", en: "Rate" },
    titles: {
      ja: '選択範囲を <prosody rate="fast"> で囲む',
      en: 'Wrap the selection with <prosody rate="fast">',
    },
    descriptions: {
      ja: "選択範囲の読み上げ速度を変更します。",
      en: "Changes the speech rate of the selected text.",
    },
    options: createInsertionOptions(RATE_OPTIONS),
    createTemplate: (value) => ({
      prefix: `<prosody rate="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "pitch",
    icon: "↗",
    labels: { ja: "高さ", en: "Pitch" },
    titles: {
      ja: '選択範囲を <prosody pitch="+2st"> で囲む',
      en: 'Wrap the selection with <prosody pitch="+2st">',
    },
    descriptions: {
      ja: "選択範囲の声の高さを変更します。",
      en: "Changes the pitch of the selected text.",
    },
    options: createInsertionOptions([
      "+2st",
      "-2st",
      "0st",
      "+4st",
      "-4st",
      "+8st",
      "-8st",
      "+12st",
      "-12st",
    ]),
    createTemplate: (value) => ({
      prefix: `<prosody pitch="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "volume",
    icon: "🔊",
    labels: { ja: "音量", en: "Volume" },
    titles: {
      ja: '選択範囲を <prosody volume="loud"> で囲む',
      en: 'Wrap the selection with <prosody volume="loud">',
    },
    descriptions: {
      ja: "選択範囲の音量を変更します。",
      en: "Changes the volume of the selected text.",
    },
    options: createInsertionOptions(VOLUME_OPTIONS),
    createTemplate: (value) => ({
      prefix: `<prosody volume="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "emotion",
    icon: "☺",
    labels: { ja: "感情", en: "Emotion" },
    titles: {
      ja: '選択範囲を <mstts:express-as style="cheerful"> で囲む',
      en: 'Wrap the selection with <mstts:express-as style="cheerful">',
    },
    descriptions: {
      ja: "選択範囲に Azure 音声の感情スタイルを適用します。",
      en: "Applies an Azure voice emotion style to the selected text.",
    },
    options: createInsertionOptions([
      "cheerful",
      "friendly",
      "calm",
      "sad",
      "angry",
      "excited",
      "serious",
    ]),
    createTemplate: (value) => ({
      prefix: `<mstts:express-as style="${value}">`,
      suffix: "</mstts:express-as>",
      mode: "wrap",
    }),
  },
  {
    id: "say-as",
    icon: "Aa",
    labels: { ja: "読み上げ", en: "Say as" },
    titles: {
      ja: '選択範囲を <say-as interpret-as="characters"> で囲む',
      en: 'Wrap the selection with <say-as interpret-as="characters">',
    },
    descriptions: {
      ja: "数字や日付などの読み上げ方を指定します。",
      en: "Specifies how values such as numbers or dates are spoken.",
    },
    options: createInsertionOptions([
      "characters",
      "spell-out",
      "cardinal",
      "ordinal",
      "number",
      "date",
      "time",
      "telephone",
      "fraction",
      "address",
      "name",
      "currency",
    ]),
    createTemplate: (value) => ({
      prefix: `<say-as interpret-as="${value}">`,
      suffix: "</say-as>",
      mode: "wrap",
    }),
  },
  {
    id: "phoneme",
    icon: "ɑ",
    labels: { ja: "発音", en: "Phoneme" },
    titles: {
      ja: '選択範囲を <phoneme alphabet="ipa"> で囲む',
      en: 'Wrap the selection with <phoneme alphabet="ipa">',
    },
    descriptions: {
      ja: "選択範囲の発音記号を指定します。",
      en: "Specifies the phonetic pronunciation of the selected text.",
    },
    options: createInsertionOptions(["ipa", "sapi", "x-sampa", "ups"]),
    createTemplate: (value) => ({
      prefix: `<phoneme alphabet="${value}" ph="">`,
      suffix: "</phoneme>",
      mode: "wrap",
    }),
  },
] satisfies readonly SsmlInsertionDefinition[];

type EditorCopy = {
  editorAriaLabel: string;
  heading: string;
  voice: string;
  text: string;
  toolbarAriaLabel: string;
  clearAll: string;
  clearAllTitle: string;
  help: string;
  helpTitle: string;
  helpHeading: string;
  helpDescription: string;
  parameters: string;
  toolbarActions: string;
  voiceDescription: string;
  voiceParameter: string;
  generatedSsml: string;
};

const EDITOR_COPY: Record<SsmlEditorLanguage, EditorCopy> = {
  ja: {
    editorAriaLabel: "SSMLエディター",
    heading: "SSMLエディター",
    voice: "音声",
    text: "本文",
    toolbarAriaLabel: "SSMLツールバー",
    clearAll: "全てクリア",
    clearAllTitle: "XML要素を削除して本文を残す",
    help: "説明",
    helpTitle: "ボタンとパラメータの説明を表示",
    helpHeading: "ボタンとパラメータの説明",
    helpDescription: "各コントロールと本文ツールバーの機能を確認できます。",
    parameters: "パラメータ",
    toolbarActions: "本文ツールバーのボタン",
    voiceDescription: "使用する Azure 音声の名前を指定します。",
    voiceParameter: "音声名（例: en-US-JennyNeural）",
    generatedSsml: "生成されたSSML",
  },
  en: {
    editorAriaLabel: "SSML editor",
    heading: "SSML Editor",
    voice: "Voice",
    text: "Text",
    toolbarAriaLabel: "SSML toolbar",
    clearAll: "Clear all",
    clearAllTitle: "Remove XML elements and keep the text",
    help: "Help",
    helpTitle: "Show button and parameter descriptions",
    helpHeading: "Button and parameter descriptions",
    helpDescription: "Learn what each control and text toolbar action does.",
    parameters: "Parameters",
    toolbarActions: "Text toolbar buttons",
    voiceDescription: "Selects the Azure voice name to use.",
    voiceParameter: "Voice name (for example, en-US-JennyNeural)",
    generatedSsml: "Generated SSML",
  },
};

const STYLE_ID = "ssml-editor-theme";
const STYLE_CSS = `
[data-ssml-editor] {
  --ssml-editor-color: #111827;
  --ssml-editor-bg: #ffffff;
  --ssml-editor-border: #d1d5db;
  --ssml-editor-control-bg: #f9fafb;
  --ssml-editor-control-border: #9ca3af;
  --ssml-editor-preview-bg: #f3f4f6;
}
@media (prefers-color-scheme: dark) {
  [data-ssml-editor] {
    --ssml-editor-color: #f9fafb;
    --ssml-editor-bg: #1f2937;
    --ssml-editor-border: #374151;
    --ssml-editor-control-bg: #111827;
    --ssml-editor-control-border: #4b5563;
    --ssml-editor-preview-bg: #111827;
  }
}
`.trim();

function injectEditorTheme(): void {
  if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }
}

export interface SsmlEditorProps {
  document: SsmlDocument;
  onChange?: (document: SsmlDocument) => void;
  onSsmlChange?: (xml: string) => void;
  /** UI language. Japanese is used when omitted. */
  language?: SsmlEditorLanguage;
  /** Whether toolbar action icons are displayed. */
  showToolbarIcons?: boolean;
  /** Whether toolbar action text labels are displayed. */
  showToolbarLabels?: boolean;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    gap: "1rem",
    padding: "1rem",
    border: "1px solid var(--ssml-editor-border)",
    borderRadius: "0.5rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
  },
  heading: {
    margin: 0,
    fontSize: "1.125rem",
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
    gap: "1rem",
  },
  field: {
    display: "grid",
    gap: "0.375rem",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarDropdown: {
    position: "relative",
    display: "inline-block",
  },
  toolbarButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    minHeight: "2.25rem",
    padding: "0.375rem 0.625rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    font: "inherit",
    cursor: "pointer",
  },
  toolbarIconOnly: {
    justifyContent: "center",
    minWidth: "2.25rem",
    padding: "0.375rem",
  },
  toolbarIcon: {
    display: "inline-flex",
    width: "1.25rem",
    justifyContent: "center",
    fontSize: "1.1rem",
    lineHeight: 1,
  },
  toolbarChevron: {
    fontSize: "0.7rem",
    lineHeight: 1,
  },
  toolbarMenu: {
    position: "absolute",
    top: "calc(100% + 0.25rem)",
    left: 0,
    zIndex: 1,
    display: "grid",
    minWidth: "max-content",
    gap: "0.125rem",
    padding: "0.25rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.25rem 0.75rem rgb(0 0 0 / 20%)",
  },
  toolbarOption: {
    padding: "0.375rem 0.5rem",
    border: 0,
    borderRadius: "0.125rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "transparent",
    font: "inherit",
    textAlign: "left",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  helpPanel: {
    display: "grid",
    gap: "0.5rem",
    padding: "0.75rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-preview-bg)",
  },
  helpHeading: {
    margin: 0,
    fontSize: "1rem",
  },
  helpSubheading: {
    margin: "0.25rem 0 0",
    fontSize: "0.9375rem",
  },
  helpDescription: {
    margin: 0,
    lineHeight: 1.5,
  },
  helpList: {
    display: "grid",
    gap: "0.375rem",
    margin: 0,
    paddingLeft: "1.25rem",
  },
  helpItem: {
    lineHeight: 1.45,
  },
  helpParameter: {
    display: "block",
    marginTop: "0.125rem",
    fontSize: "0.875rem",
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "2.25rem",
    padding: "0.375rem 0.5rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    font: "inherit",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
  },
  editor: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "8rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    overflow: "hidden",
  },
  preview: {
    margin: 0,
    padding: "0.75rem",
    overflowX: "auto",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-preview-bg)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "pre-wrap",
  },
};

type MonacoEditor = Parameters<OnMount>[0];
type SsmlInsertion = (typeof SSML_INSERTIONS)[number];
type MonacoLanguages = Monaco["languages"];
type MonacoHoverProvider = Parameters<
  MonacoLanguages["registerHoverProvider"]
>[1];
type MonacoHoverModel = Parameters<MonacoHoverProvider["provideHover"]>[0];
type MonacoHoverPosition = Parameters<MonacoHoverProvider["provideHover"]>[1];

interface HoverProviderRegistration {
  disposable: ReturnType<MonacoLanguages["registerHoverProvider"]>;
  references: number;
}

const hoverProviderRegistrations = new WeakMap<
  MonacoLanguages,
  HoverProviderRegistration
>();

function isSsmlElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function isVoice(element: SsmlElement): element is VoiceElement {
  return element.type === "voice";
}

function isProsody(element: SsmlElement): element is ProsodyElement {
  return element.type === "prosody";
}

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return (
    document.children ??
    (document.content === undefined ? [] : [document.content])
  );
}

function findFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
): T | undefined {
  for (const node of nodes) {
    if (!isSsmlElement(node)) {
      continue;
    }

    if (predicate(node)) {
      return node;
    }

    const child = findFirstElement(node.children ?? [], predicate);
    if (child) {
      return child;
    }
  }

  return undefined;
}

function updateFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
  update: (element: T) => SsmlElement,
): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || !isSsmlElement(node)) {
      return node;
    }

    if (predicate(node)) {
      updated = true;
      return update(node);
    }

    if (node.children) {
      const result = updateFirstElement(node.children, predicate, update);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function getPlainText(nodes: SsmlNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") {
        return node;
      }
      if (node.type === "text") {
        return node.value;
      }
      return getPlainText(node.children ?? []);
    })
    .join("");
}

function withChildren(
  document: SsmlDocument,
  children: SsmlNode[],
): SsmlDocument {
  const nextDocument: SsmlDocument = { ...document, children };
  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }
  return nextDocument;
}

function clearDocument(document: SsmlDocument): SsmlDocument {
  const text = getPlainText(getDocumentChildren(document));
  return withChildren(document, text === "" ? [] : [text]);
}

function createProsody(
  children: SsmlNode[],
  updates: Partial<ProsodyElement> = {},
): ProsodyElement {
  return {
    type: "prosody",
    rate: DEFAULT_RATE,
    pitch: DEFAULT_PITCH,
    volume: DEFAULT_VOLUME,
    ...updates,
    children: children.length > 0 ? children : [""],
  };
}

function updateVoiceName(document: SsmlDocument, name: string): SsmlDocument {
  const children = getDocumentChildren(document);
  const result = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    name,
  }));
  if (result.updated) {
    return withChildren(document, result.nodes);
  }

  return withChildren(document, [
    {
      type: "voice",
      name,
      children: [createProsody(children)],
    },
  ]);
}

function parseEditableText(value: string): SsmlNode[] {
  try {
    const children =
      parseSsml(`<speak version="1.0" xml:lang="en-US">${value}</speak>`)
        .children ?? [];
    return children.some(isSsmlElement) ? children : [value];
  } catch {
    return [value];
  }
}

function serializeEditableText(nodes: SsmlNode[]): string {
  if (nodes.length === 1 && typeof nodes[0] === "string") {
    return nodes[0];
  }

  const xml = buildSsml({
    version: "1.0",
    lang: "en-US",
    children: nodes,
  });
  const contentStart = xml.indexOf(">") + 1;
  return xml.slice(contentStart, -"</speak>".length);
}

function getEditableChildren(document: SsmlDocument): SsmlNode[] {
  const children = getDocumentChildren(document);
  const element =
    findFirstElement(children, isProsody) ??
    findFirstElement(children, isVoice);
  return element?.children ?? children;
}

function getEditableText(document: SsmlDocument): string {
  return serializeEditableText(getEditableChildren(document));
}

function updateText(document: SsmlDocument, value: string): SsmlDocument {
  const nextChildren = parseEditableText(value);
  const editableChildren = nextChildren.length > 0 ? nextChildren : [value];
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    children: editableChildren,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: editableChildren,
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, editableChildren);
}

function acquireSsmlHoverProvider(monaco: Monaco): () => void {
  const languages = monaco.languages;
  let registration = hoverProviderRegistrations.get(languages);

  if (!registration) {
    const provider: Parameters<MonacoLanguages["registerHoverProvider"]>[1] = {
      provideHover(model: MonacoHoverModel, position: MonacoHoverPosition) {
        const target = findSsmlHoverTarget(
          model.getValue(),
          position.lineNumber,
          position.column,
        );
        if (!target) {
          return undefined;
        }

        return {
          contents: [
            {
              isTrusted: false,
              supportHtml: false,
              value: formatSsmlHover(target),
            },
          ],
          range: target.range,
        };
      },
    };
    const disposable = languages.registerHoverProvider("xml", {
      ...provider,
    });
    registration = { disposable, references: 0 };
    hoverProviderRegistrations.set(languages, registration);
  }

  registration.references += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;

    const current = hoverProviderRegistrations.get(languages);
    if (!current) {
      return;
    }

    current.references -= 1;
    if (current.references === 0) {
      current.disposable.dispose();
      hoverProviderRegistrations.delete(languages);
    }
  };
}

function applySsmlInsertion(
  editor: MonacoEditor,
  insertion: SsmlInsertion,
  option: SsmlInsertionOption,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return;
  }

  const template = insertion.createTemplate(option.value);
  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const selectedText = model.getValueInRange(selection);
  const replacement =
    template.mode === "insert"
      ? `${template.prefix}${selectedText}`
      : `${template.prefix}${selectedText}${template.suffix}`;

  editor.pushUndoStop();
  const applied = editor.executeEdits("ssml-toolbar", [
    {
      range: selection,
      text: replacement,
    },
  ]);
  editor.pushUndoStop();
  if (!applied) {
    return;
  }

  const nextSelectionStart = model.getPositionAt(
    startOffset + template.prefix.length,
  );
  const nextSelectionEnd = model.getPositionAt(
    endOffset + template.prefix.length,
  );
  editor.setSelection({
    selectionStartLineNumber: nextSelectionStart.lineNumber,
    selectionStartColumn: nextSelectionStart.column,
    positionLineNumber: nextSelectionEnd.lineNumber,
    positionColumn: nextSelectionEnd.column,
  });
  editor.focus();
}

export function SsmlEditor({
  document,
  onChange,
  onSsmlChange,
  language = DEFAULT_LANGUAGE,
  showToolbarIcons = true,
  showToolbarLabels = false,
}: SsmlEditorProps): ReactElement {
  const helpPanelId = useId();
  const [draftDocument, setDraftDocument] = useState(document);
  const editorRef = useRef<MonacoEditor | null>(null);
  const releaseHoverProviderRef = useRef<(() => void) | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const copy = EDITOR_COPY[language];
  const showToolbarText = showToolbarLabels || !showToolbarIcons;
  const toolbarButtonStyle = showToolbarText
    ? styles.toolbarButton
    : { ...styles.toolbarButton, ...styles.toolbarIconOnly };

  useEffect(() => {
    injectEditorTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setDraftDocument(document);
  }, [document]);

  useEffect(() => {
    return () => {
      releaseHoverProviderRef.current?.();
      releaseHoverProviderRef.current = null;
      editorRef.current = null;
    };
  }, []);

  const children = getDocumentChildren(draftDocument);
  const voice = findFirstElement(children, isVoice);
  const voiceName = voice?.name ?? DEFAULT_VOICE;
  const text = getEditableText(draftDocument);

  const commit = (nextDocument: SsmlDocument): void => {
    setDraftDocument(nextDocument);
    onChange?.(nextDocument);
    onSsmlChange?.(buildSsml(nextDocument));
  };

  return (
    <section
      style={styles.container}
      aria-label={copy.editorAriaLabel}
      data-ssml-editor=""
    >
      <h2 style={styles.heading}>{copy.heading}</h2>
      <div style={styles.controls}>
        <label style={styles.field} htmlFor="ssml-editor-voice">
          {copy.voice}
          <input
            id="ssml-editor-voice"
            style={styles.input}
            type="text"
            value={voiceName}
            onChange={(event) =>
              commit(updateVoiceName(draftDocument, event.target.value))
            }
          />
        </label>
      </div>
      <div style={styles.field}>
        <span>{copy.text}</span>
        <div
          style={styles.toolbar}
          role="toolbar"
          aria-label={copy.toolbarAriaLabel}
        >
          <button
            type="button"
            style={toolbarButtonStyle}
            aria-label={copy.help}
            title={copy.helpTitle}
            aria-expanded={isHelpOpen}
            aria-controls={helpPanelId}
            onClick={() => setIsHelpOpen((open) => !open)}
          >
            {showToolbarIcons && (
              <span style={styles.toolbarIcon} aria-hidden="true">
                ?
              </span>
            )}
            {showToolbarText && <span>{copy.help}</span>}
          </button>
          {SSML_INSERTIONS.map((insertion) => (
            <details key={insertion.id} style={styles.toolbarDropdown}>
              <summary
                style={{
                  ...toolbarButtonStyle,
                  listStyleType: "none",
                }}
                title={insertion.titles[language]}
                aria-label={insertion.labels[language]}
                aria-haspopup="menu"
              >
                {showToolbarIcons && (
                  <span style={styles.toolbarIcon} aria-hidden="true">
                    {insertion.icon}
                  </span>
                )}
                {showToolbarText && <span>{insertion.labels[language]}</span>}
                <span style={styles.toolbarChevron} aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div
                style={styles.toolbarMenu}
                role="menu"
                aria-label={insertion.labels[language]}
              >
                {insertion.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    style={styles.toolbarOption}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (editorRef.current) {
                        applySsmlInsertion(
                          editorRef.current,
                          insertion,
                          option,
                        );
                      }
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    {option.labels[language]}
                  </button>
                ))}
              </div>
            </details>
          ))}
          <button
            type="button"
            style={toolbarButtonStyle}
            aria-label={copy.clearAll}
            title={copy.clearAllTitle}
            onClick={() => commit(clearDocument(draftDocument))}
          >
            {showToolbarIcons && (
              <span style={styles.toolbarIcon} aria-hidden="true">
                ×
              </span>
            )}
            {showToolbarText && <span>{copy.clearAll}</span>}
          </button>
        </div>
        {isHelpOpen && (
          <section
            id={helpPanelId}
            style={styles.helpPanel}
            aria-label={copy.helpHeading}
          >
            <h3 style={styles.helpHeading}>{copy.helpHeading}</h3>
            <p style={styles.helpDescription}>{copy.helpDescription}</p>
            <ul style={styles.helpList}>
              <li style={styles.helpItem}>
                <strong>{copy.voice}</strong> — {copy.voiceDescription}
                <span style={styles.helpParameter}>
                  {copy.parameters}: {copy.voiceParameter}
                </span>
              </li>
            </ul>
            <h4 style={styles.helpSubheading}>{copy.toolbarActions}</h4>
            <ul style={styles.helpList}>
              {SSML_INSERTIONS.map((insertion) => (
                <li key={insertion.id} style={styles.helpItem}>
                  <strong>{insertion.labels[language]}</strong> —{" "}
                  {insertion.descriptions[language]}
                  <span style={styles.helpParameter}>
                    {copy.parameters}:{" "}
                    {insertion.options
                      .map((option) => option.labels[language])
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div style={styles.editor}>
          <Editor
            height="8rem"
            language="xml"
            theme={isDark ? "vs-dark" : "light"}
            options={{ hover: { enabled: "on" } }}
            value={text}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              releaseHoverProviderRef.current?.();
              releaseHoverProviderRef.current =
                acquireSsmlHoverProvider(monaco);
            }}
            onChange={(value) => commit(updateText(draftDocument, value ?? ""))}
          />
        </div>
      </div>
      <details>
        <summary>{copy.generatedSsml}</summary>
        <pre style={styles.preview}>{buildSsml(draftDocument)}</pre>
      </details>
    </section>
  );
}
