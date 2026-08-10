import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
import type {
  ProsodyElement,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  VoiceElement,
} from "@ssml-builder/ssml-core";

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
  rate: string;
  volume: string;
  pitch: string;
  pitchValueAriaLabel: string;
  text: string;
  toolbarAriaLabel: string;
  clearAll: string;
  clearAllTitle: string;
  generatedSsml: string;
};

const EDITOR_COPY: Record<SsmlEditorLanguage, EditorCopy> = {
  ja: {
    editorAriaLabel: "SSMLエディター",
    heading: "SSMLエディター",
    voice: "音声",
    rate: "速度",
    volume: "音量",
    pitch: "高さ",
    pitchValueAriaLabel: "高さの値",
    text: "本文",
    toolbarAriaLabel: "SSMLツールバー",
    clearAll: "全てクリア",
    clearAllTitle: "本文とSSML要素を全てクリア",
    generatedSsml: "生成されたSSML",
  },
  en: {
    editorAriaLabel: "SSML editor",
    heading: "SSML Editor",
    voice: "Voice",
    rate: "Rate",
    volume: "Volume",
    pitch: "Pitch",
    pitchValueAriaLabel: "Pitch value",
    text: "Text",
    toolbarAriaLabel: "SSML toolbar",
    clearAll: "Clear all",
    clearAllTitle: "Clear all editable text and SSML elements",
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
  toolbarIcon: {
    display: "inline-flex",
    width: "1.25rem",
    justifyContent: "center",
    fontSize: "1.1rem",
    lineHeight: 1,
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
  range: {
    width: "100%",
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
  return withChildren(document, []);
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

function updateProsody(
  document: SsmlDocument,
  updates: Partial<ProsodyElement>,
): SsmlDocument {
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    ...updates,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: [createProsody(voice.children ?? [], updates)],
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, [
    {
      type: "voice",
      name: DEFAULT_VOICE,
      children: [createProsody(children, updates)],
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

function getEditableText(document: SsmlDocument): string {
  const children = getDocumentChildren(document);
  const element =
    findFirstElement(children, isProsody) ??
    findFirstElement(children, isVoice);
  return serializeEditableText(element?.children ?? children);
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

function getPitchValue(pitch: string | number | undefined): number {
  const match = String(pitch ?? DEFAULT_PITCH).match(
    /^([+-]?\d+(?:\.\d+)?)st$/,
  );
  const value = match ? Number(match[1]) : 0;
  return Math.min(12, Math.max(-12, value));
}

function formatPitch(value: number): string {
  return `${value > 0 ? "+" : ""}${value}st`;
}

function applySsmlInsertion(
  editor: MonacoEditor,
  insertion: SsmlInsertion,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return;
  }

  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const selectedText = model.getValueInRange(selection);
  const replacement =
    insertion.mode === "insert"
      ? `${insertion.prefix}${selectedText}`
      : `${insertion.prefix}${selectedText}${insertion.suffix}`;

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
    startOffset + insertion.prefix.length,
  );
  const nextSelectionEnd = model.getPositionAt(
    endOffset + insertion.prefix.length,
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
}: SsmlEditorProps): ReactElement {
  const [draftDocument, setDraftDocument] = useState(document);
  const editorRef = useRef<MonacoEditor | null>(null);
  const [isDark, setIsDark] = useState(false);
  const copy = EDITOR_COPY[language];

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

  const children = getDocumentChildren(draftDocument);
  const voice = findFirstElement(children, isVoice);
  const prosody = findFirstElement(children, isProsody);
  const voiceName = voice?.name ?? DEFAULT_VOICE;
  const pitch = String(prosody?.pitch ?? DEFAULT_PITCH);
  const pitchValue = getPitchValue(prosody?.pitch);
  const rate = String(prosody?.rate ?? DEFAULT_RATE);
  const volume = String(prosody?.volume ?? DEFAULT_VOLUME);
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
        <label style={styles.field} htmlFor="ssml-editor-rate">
          {copy.rate}
          <select
            id="ssml-editor-rate"
            style={styles.input}
            value={rate}
            onChange={(event) =>
              commit(updateProsody(draftDocument, { rate: event.target.value }))
            }
          >
            {!([...RATE_OPTIONS] as string[]).includes(rate) && (
              <option value={rate}>{rate}</option>
            )}
            {RATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field} htmlFor="ssml-editor-volume">
          {copy.volume}
          <select
            id="ssml-editor-volume"
            style={styles.input}
            value={volume}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, { volume: event.target.value }),
              )
            }
          >
            {!([...VOLUME_OPTIONS] as string[]).includes(volume) && (
              <option value={volume}>{volume}</option>
            )}
            {VOLUME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div style={styles.field}>
          <label htmlFor="ssml-editor-pitch">
            {copy.pitch}: {pitch}
          </label>
          <input
            id="ssml-editor-pitch"
            style={styles.range}
            type="range"
            min="-12"
            max="12"
            step="1"
            value={pitchValue}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, {
                  pitch: formatPitch(Number(event.target.value)),
                }),
              )
            }
          />
          <input
            aria-label={copy.pitchValueAriaLabel}
            style={styles.input}
            type="text"
            value={pitch}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, { pitch: event.target.value }),
              )
            }
          />
        </div>
      </div>
      <div style={styles.field}>
        <span>{copy.text}</span>
        <div
          style={styles.toolbar}
          role="toolbar"
          aria-label={copy.toolbarAriaLabel}
        >
          {SSML_INSERTIONS.map((insertion) => (
            <button
              key={insertion.id}
              type="button"
              style={styles.toolbarButton}
              title={insertion.titles[language]}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (editorRef.current) {
                  applySsmlInsertion(editorRef.current, insertion);
                }
              }}
            >
              {showToolbarIcons && (
                <span style={styles.toolbarIcon} aria-hidden="true">
                  {insertion.icon}
                </span>
              )}
              <span>{insertion.labels[language]}</span>
            </button>
          ))}
          <button
            type="button"
            style={styles.toolbarButton}
            title={copy.clearAllTitle}
            onClick={() => commit(clearDocument(draftDocument))}
          >
            {showToolbarIcons && (
              <span style={styles.toolbarIcon} aria-hidden="true">
                ×
              </span>
            )}
            <span>{copy.clearAll}</span>
          </button>
        </div>
        <div style={styles.editor}>
          <Editor
            height="8rem"
            language="xml"
            theme={isDark ? "vs-dark" : "light"}
            value={text}
            onMount={(editor) => {
              editorRef.current = editor;
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
