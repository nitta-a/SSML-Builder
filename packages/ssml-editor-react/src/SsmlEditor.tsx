import { Fragment, forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import { isSsmlEditorButtonVisible, type SsmlEditorButton, type SsmlEditorButtonVisibility } from "./buttonVisibility";
import {
  BREAK_TIME_DESCRIPTIONS,
  BREAK_TIME_PRESETS,
  AUDIO_DURATION_DESCRIPTIONS,
  AUDIO_DURATION_PRESETS,
  EMPHASIS_LEVEL_DESCRIPTIONS,
  EMPHASIS_LEVEL_PRESETS,
  EXPRESS_AS_STYLE_DESCRIPTIONS,
  EXPRESS_AS_STYLE_PRESETS,
  LANGUAGE_DESCRIPTIONS,
  LANGUAGE_PRESETS,
  PROSODY_PITCH_DESCRIPTIONS,
  PROSODY_PITCH_PRESETS,
  PROSODY_RATE_DESCRIPTIONS,
  PROSODY_RATE_PRESETS,
  PROSODY_VOLUME_DESCRIPTIONS,
  PROSODY_VOLUME_PRESETS,
  SAY_AS_DESCRIPTIONS,
  SAY_AS_PRESETS,
  SILENCE_VALUE_DESCRIPTIONS,
  SILENCE_VALUE_PRESETS,
} from "./constants/ssmlPresets";
import {
  EDITOR_COPY,
  type EditorCopy,
  type SsmlEditorLanguage,
  type SsmlEditorLocale,
  type SsmlEditorLocalizedText,
} from "./locales";
import { DEFAULT_LOCALE } from "./constants/ui";
import { ProsodyPopovers } from "./components/popovers/ProsodyPopovers";
import { TextPopovers } from "./components/popovers/TextPopovers";
import { TimingPopovers } from "./components/popovers/TimingPopovers";
import { InsertionPopover } from "./components/popovers/InsertionPopover";
import { useSsmlEditorState } from "./hooks/useSsmlEditorState";
import { useSsmlMonaco } from "./hooks/useSsmlMonaco";
import { editorStyles as styles } from "./styles/editorStyles";
import { VisualSsmlEditor } from "./components/VisualSsmlEditor";
const UNGROUPED_TOOLBAR_GROUP = "__ssml-editor-ungrouped__";
const TIMING_POPOVER_TAGS = new Set(["break", "mstts:silence", "mstts:audioduration"]);
const PROSODY_POPOVER_TAGS = new Set(["prosody", "mstts:express-as", "voice", "emphasis"]);
const TEXT_POPOVER_TAGS = new Set(["sub", "say-as", "phoneme", "w", "lang"]);

export type { SsmlEditorLanguage, SsmlEditorLocalizedText } from "./locales";

export type SsmlEditorInsertionMode = "insert" | "wrap";

export interface SsmlEditorInsertionOption {
  value: string;
  labels: SsmlEditorLocalizedText;
  descriptions?: SsmlEditorLocalizedText;
}

export interface SsmlEditorInsertionTemplate {
  prefix: string;
  suffix: string;
  mode: SsmlEditorInsertionMode;
}

export interface SsmlEditorInsertionDefinition {
  id: string;
  icon: string;
  tagName?: string;
  selfClosing?: boolean;
  labels: SsmlEditorLocalizedText;
  titles?: SsmlEditorLocalizedText;
  descriptions: SsmlEditorLocalizedText;
  parameterDescription: SsmlEditorLocalizedText;
  options: readonly SsmlEditorInsertionOption[];
  createTemplate: (value: string) => SsmlEditorInsertionTemplate;
}

export interface SsmlEditorCustomInsertionDefinition {
  id: string;
  tagName: string;
  attribute?: string;
  icon?: string;
  labels: SsmlEditorLocalizedText;
  titles?: SsmlEditorLocalizedText;
  descriptions?: SsmlEditorLocalizedText;
  parameterDescription?: SsmlEditorLocalizedText;
  options: readonly SsmlEditorInsertionOption[];
  mode?: SsmlEditorInsertionMode;
}

export type SsmlEditorCustomInsertion = SsmlEditorInsertionDefinition | SsmlEditorCustomInsertionDefinition;

export type SsmlEditorCustomInsertionCollection =
  | readonly SsmlEditorCustomInsertion[]
  | Readonly<Record<string, SsmlEditorCustomInsertion | undefined>>;

export interface SsmlEditorInsertionGroup {
  id: string;
  labels: SsmlEditorLocalizedText;
  insertionIds: readonly string[];
}

export interface SsmlEditorToolbarGroup {
  id: string;
  buttonIds: readonly string[];
}

export type SsmlEditorTheme = "system" | "light" | "dark";
export type SsmlEditorWordWrap = "off" | "on" | "wordWrapColumn" | "bounded";
export type SsmlEditorLineNumbers = "on" | "off" | "relative" | "interval";

export interface SsmlEditorOptions {
  height?: string | number;
  minHeight?: string | number;
  readOnly?: boolean;
  theme?: SsmlEditorTheme;
  fontSize?: number;
  wordWrap?: SsmlEditorWordWrap;
  lineNumbers?: SsmlEditorLineNumbers;
  minimap?: boolean;
  automaticLayout?: boolean;
}

export type SsmlInsertionOption = SsmlEditorInsertionOption;
export type SsmlInsertionTemplate = SsmlEditorInsertionTemplate;
export type SsmlInsertionDefinition = SsmlEditorInsertionDefinition;

function localizedText(value: string): SsmlEditorLocalizedText {
  return { ja: value, en: value };
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

export function createSsmlEditorInsertionDefinition(
  definition: SsmlEditorCustomInsertionDefinition,
): SsmlEditorInsertionDefinition {
  const mode = definition.mode ?? "wrap";
  const attribute = definition.attribute ? ` ${definition.attribute}="` : "";

  return {
    id: definition.id,
    icon: definition.icon ?? "＋",
    tagName: definition.tagName,
    selfClosing: mode === "insert",
    labels: definition.labels,
    titles: definition.titles,
    descriptions: definition.descriptions ?? localizedText(`Inserts the <${definition.tagName}> element.`),
    parameterDescription:
      definition.parameterDescription ?? localizedText(`Selects the value for the <${definition.tagName}> element.`),
    options: definition.options,
    createTemplate: (value) => {
      const attributeValue = definition.attribute ? `${attribute}${escapeXmlAttribute(value)}"` : "";
      if (mode === "wrap") {
        return {
          prefix: `<${definition.tagName}${attributeValue}>`,
          suffix: `</${definition.tagName}>`,
          mode,
        };
      }

      return {
        prefix: `<${definition.tagName}${attributeValue}/>`,
        suffix: "",
        mode,
      };
    },
  };
}

function createInsertionOptions(
  values: readonly string[],
  descriptions?: Readonly<Record<string, SsmlEditorLocalizedText>>,
): readonly SsmlInsertionOption[] {
  return values.map((value) => ({
    value,
    labels: { ja: value, en: value },
    ...(descriptions?.[value] ? { descriptions: descriptions[value] } : {}),
  }));
}

export const SSML_INSERTIONS = [
  {
    id: "break",
    icon: "⏸",
    tagName: "break",
    selfClosing: true,
    labels: { ja: "間", en: "Break" },
    descriptions: {
      ja: "指定した時間だけ無音の間を挿入します。",
      en: "Inserts a silent pause for the selected duration.",
    },
    parameterDescription: {
      ja: "無音にする時間を選択します。",
      en: "Selects the duration of the silent pause.",
    },
    options: createInsertionOptions(BREAK_TIME_PRESETS, BREAK_TIME_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<break time="${value}"/>`,
      suffix: "",
      mode: "insert",
    }),
  },
  {
    id: "emphasis",
    icon: "✦",
    tagName: "emphasis",
    labels: { ja: "強調", en: "Emphasis" },
    descriptions: {
      ja: "選択範囲の強調レベルを変更します。",
      en: "Changes the emphasis level of the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲の強調レベルを選択します。",
      en: "Selects the emphasis level for the selected text.",
    },
    options: createInsertionOptions(EMPHASIS_LEVEL_PRESETS, EMPHASIS_LEVEL_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<emphasis level="${value}">`,
      suffix: "</emphasis>",
      mode: "wrap",
    }),
  },
  {
    id: "rate",
    icon: "↕",
    tagName: "prosody",
    labels: { ja: "速度", en: "Rate" },
    descriptions: {
      ja: "選択範囲の読み上げ速度を変更します。",
      en: "Changes the speech rate of the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲の読み上げ速度を選択します。",
      en: "Selects the speech rate for the selected text.",
    },
    options: createInsertionOptions(PROSODY_RATE_PRESETS, PROSODY_RATE_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<prosody rate="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "pitch",
    icon: "↗",
    tagName: "prosody",
    labels: { ja: "高さ", en: "Pitch" },
    descriptions: {
      ja: "選択範囲の声の高さを変更します。",
      en: "Changes the pitch of the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲の声の高さを半音単位で選択します。",
      en: "Selects the pitch adjustment in semitone steps.",
    },
    options: createInsertionOptions(PROSODY_PITCH_PRESETS, PROSODY_PITCH_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<prosody pitch="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "volume",
    icon: "🔊",
    tagName: "prosody",
    labels: { ja: "音量", en: "Volume" },
    descriptions: {
      ja: "選択範囲の音量を変更します。",
      en: "Changes the volume of the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲の音量レベルを選択します。",
      en: "Selects the volume level for the selected text.",
    },
    options: createInsertionOptions(PROSODY_VOLUME_PRESETS, PROSODY_VOLUME_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<prosody volume="${value}">`,
      suffix: "</prosody>",
      mode: "wrap",
    }),
  },
  {
    id: "emotion",
    icon: "☺",
    tagName: "mstts:express-as",
    labels: { ja: "感情", en: "Emotion" },
    descriptions: {
      ja: "選択範囲に音声の感情スタイルを適用します。",
      en: "Applies a voice emotion style to the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲に適用する音声の感情スタイルを選択します。",
      en: "Selects the voice emotion style to apply.",
    },
    options: createInsertionOptions(EXPRESS_AS_STYLE_PRESETS, EXPRESS_AS_STYLE_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<mstts:express-as style="${value}">`,
      suffix: "</mstts:express-as>",
      mode: "wrap",
    }),
  },
  {
    id: "say-as",
    icon: "Aa",
    tagName: "say-as",
    labels: { ja: "読み上げ", en: "Say as" },
    descriptions: {
      ja: "数字や日付などの読み上げ方を指定します。",
      en: "Specifies how values such as numbers or dates are spoken.",
    },
    parameterDescription: {
      ja: "選択範囲の読み上げ方を選択します。",
      en: "Selects how the selected text is spoken.",
    },
    options: createInsertionOptions(SAY_AS_PRESETS, SAY_AS_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<say-as interpret-as="${value}">`,
      suffix: "</say-as>",
      mode: "wrap",
    }),
  },
  {
    id: "lang",
    icon: "文",
    tagName: "lang",
    labels: { ja: "言語", en: "Language" },
    descriptions: {
      ja: "選択範囲の読み上げ言語を変更します。",
      en: "Changes the speaking language of the selected text.",
    },
    parameterDescription: {
      ja: "選択範囲に適用する BCP-47 言語タグを選択します。",
      en: "Selects the BCP-47 language tag for the selected text.",
    },
    options: createInsertionOptions(LANGUAGE_PRESETS, LANGUAGE_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<lang xml:lang="${value}">`,
      suffix: "</lang>",
      mode: "wrap",
    }),
  },
  {
    id: "mstts:silence",
    icon: "⏳",
    tagName: "mstts:silence",
    selfClosing: true,
    labels: { ja: "無音", en: "Silence" },
    descriptions: {
      ja: "無音時間を挿入します。",
      en: "Inserts a silence interval.",
    },
    parameterDescription: {
      ja: "無音にする時間を選択します。",
      en: "Selects the silence duration.",
    },
    options: createInsertionOptions(SILENCE_VALUE_PRESETS, SILENCE_VALUE_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<mstts:silence type="Leading" value="${value}"/>`,
      suffix: "",
      mode: "insert",
    }),
  },
  {
    id: "mstts:audioduration",
    icon: "◷",
    tagName: "mstts:audioduration",
    selfClosing: true,
    labels: { ja: "音声長", en: "Audio duration" },
    descriptions: {
      ja: "合成音声の目標時間を指定します。",
      en: "Sets the target duration of synthesized audio.",
    },
    parameterDescription: {
      ja: "目標時間を選択します。",
      en: "Selects the target duration.",
    },
    options: createInsertionOptions(AUDIO_DURATION_PRESETS, AUDIO_DURATION_DESCRIPTIONS),
    createTemplate: (value) => ({
      prefix: `<mstts:audioduration value="${value}"/>`,
      suffix: "",
      mode: "insert",
    }),
  },
] satisfies readonly SsmlInsertionDefinition[];

const DEFAULT_INSERTION_GROUPS = [
  {
    id: "pauses",
    labels: { ja: "間・無音", en: "Pauses" },
    insertionIds: ["break", "mstts:silence", "mstts:audioduration"],
  },
  {
    id: "prosody",
    labels: { ja: "声の調整", en: "Voice" },
    insertionIds: ["rate", "pitch", "volume"],
  },
  {
    id: "expression",
    labels: { ja: "表現", en: "Expression" },
    insertionIds: ["emphasis", "emotion"],
  },
  {
    id: "pronunciation",
    labels: { ja: "読み上げ", en: "Pronunciation" },
    insertionIds: ["say-as", "lang"],
  },
] satisfies readonly SsmlEditorInsertionGroup[];

function createDefaultToolbarGroups(
  insertionGroups: readonly SsmlEditorInsertionGroup[],
): readonly SsmlEditorToolbarGroup[] {
  return [
    {
      id: "history",
      buttonIds: ["undo", "redo"],
    },
    ...insertionGroups.map(({ id, insertionIds }) => ({
      id,
      buttonIds: insertionIds,
    })),
    {
      id: "document",
      buttonIds: ["clearAll", "format", "decorations"],
    },
    {
      id: "help",
      buttonIds: ["help"],
    },
  ];
}

function getInsertionCollection(
  collection: SsmlEditorCustomInsertionCollection | undefined,
): readonly SsmlEditorCustomInsertion[] {
  if (!collection) {
    return [];
  }

  return Array.isArray(collection)
    ? collection
    : Object.values(collection).filter((insertion): insertion is SsmlEditorCustomInsertion => insertion !== undefined);
}

function getConfiguredInsertions(
  emotionStyles: readonly string[] | undefined,
  customInsertions: SsmlEditorCustomInsertionCollection | undefined,
  additionalInsertions: SsmlEditorCustomInsertionCollection | undefined,
): readonly SsmlInsertionDefinition[] {
  const insertions = new Map<string, SsmlInsertionDefinition>();
  for (const insertion of SSML_INSERTIONS) {
    if (insertion.id === "emotion" && emotionStyles !== undefined) {
      insertions.set(insertion.id, {
        ...insertion,
        options: createInsertionOptions(emotionStyles),
      });
      continue;
    }
    insertions.set(insertion.id, insertion);
  }

  const normalizeInsertion = (insertion: SsmlEditorCustomInsertion): SsmlInsertionDefinition =>
    "createTemplate" in insertion ? insertion : createSsmlEditorInsertionDefinition(insertion);

  for (const insertion of getInsertionCollection(additionalInsertions)) {
    const normalized = normalizeInsertion(insertion);
    if (!insertions.has(normalized.id)) {
      insertions.set(normalized.id, normalized);
    }
  }

  for (const insertion of getInsertionCollection(customInsertions)) {
    const normalized = normalizeInsertion(insertion);
    insertions.set(normalized.id, normalized);
  }

  return [...insertions.values()];
}

function orderInsertions(
  insertions: readonly SsmlInsertionDefinition[],
  insertionOrder: readonly string[] | undefined,
): readonly SsmlInsertionDefinition[] {
  if (!insertionOrder || insertionOrder.length === 0) {
    return insertions;
  }

  const insertionsById = new Map(insertions.map((insertion) => [insertion.id, insertion]));
  const ordered: SsmlInsertionDefinition[] = [];
  const included = new Set<string>();
  for (const id of insertionOrder) {
    const insertion = insertionsById.get(id);
    if (insertion && !included.has(id)) {
      ordered.push(insertion);
      included.add(id);
    }
  }

  for (const insertion of insertions) {
    if (!included.has(insertion.id)) {
      ordered.push(insertion);
    }
  }

  return ordered;
}

function orderToolbarButtons(
  buttonIds: readonly string[],
  toolbarOrder: readonly string[] | undefined,
): readonly string[] {
  if (!toolbarOrder || toolbarOrder.length === 0) {
    return buttonIds;
  }

  const available = new Set(buttonIds);
  const ordered: string[] = [];
  const included = new Set<string>();
  for (const id of toolbarOrder) {
    if (available.has(id) && !included.has(id)) {
      ordered.push(id);
      included.add(id);
    }
  }

  for (const id of buttonIds) {
    if (!included.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

const STYLE_ID = "ssml-editor-theme";
const STYLE_CSS = `
[data-ssml-editor] {
  --ssml-editor-color: #111827;
  --ssml-editor-bg: #ffffff;
  --ssml-editor-border: #d1d5db;
  --ssml-editor-control-bg: #f9fafb;
  --ssml-editor-control-border: #9ca3af;
  --ssml-editor-active-bg: #dbeafe;
  --ssml-editor-active-border: #2563eb;
  --ssml-editor-preview-bg: #f3f4f6;
  --ssml-editor-error: #b91c1c;
  --ssml-editor-error-bg: #fef2f2;
  --ssml-editor-switch-active: #2563eb;
  --ssml-editor-pause-badge-bg: #e0e7ff;
  --ssml-editor-pause-badge-color: #3730a3;
  --ssml-editor-pause-badge-border: #c7d2fe;
  --ssml-editor-prosody-badge-bg: #dcfce7;
  --ssml-editor-prosody-badge-color: #166534;
  --ssml-editor-prosody-badge-border: #86efac;
}
[data-ssml-editor][data-theme="dark"] {
  --ssml-editor-color: #f9fafb;
  --ssml-editor-bg: #1f2937;
  --ssml-editor-border: #374151;
  --ssml-editor-control-bg: #111827;
  --ssml-editor-control-border: #4b5563;
  --ssml-editor-active-bg: #1e3a8a;
  --ssml-editor-active-border: #60a5fa;
  --ssml-editor-preview-bg: #111827;
  --ssml-editor-error: #fca5a5;
  --ssml-editor-error-bg: #450a0a;
  --ssml-editor-switch-active: #60a5fa;
  --ssml-editor-pause-badge-bg: #312e81;
  --ssml-editor-pause-badge-color: #c7d2fe;
  --ssml-editor-pause-badge-border: #6366f1;
  --ssml-editor-prosody-badge-bg: #14532d;
  --ssml-editor-prosody-badge-color: #bbf7d0;
  --ssml-editor-prosody-badge-border: #4ade80;
}
[data-ssml-editor] .ssml-editor-inline-badge {
  display: inline-block;
  margin-left: 0.35em;
  padding: 0 0.35em;
  border: 1px solid;
  border-radius: 999px;
  font-size: 0.75em;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  vertical-align: middle;
  pointer-events: none;
}
[data-ssml-editor] .ssml-editor-inline-badge-pause {
  color: var(--ssml-editor-pause-badge-color);
  background-color: var(--ssml-editor-pause-badge-bg);
  border-color: var(--ssml-editor-pause-badge-border);
}
[data-ssml-editor] .ssml-editor-inline-badge-prosody {
  color: var(--ssml-editor-prosody-badge-color);
  background-color: var(--ssml-editor-prosody-badge-bg);
  border-color: var(--ssml-editor-prosody-badge-border);
}
[data-ssml-editor] .ssml-editor-switch-track[aria-checked="true"] {
  background-color: var(--ssml-editor-switch-active);
}
[data-ssml-editor] .ssml-editor-switch-track[aria-checked="true"] .ssml-editor-switch-thumb {
  transform: translateX(1.25rem);
}
[data-ssml-editor] .ssml-editor-switch-track:focus-visible {
  outline: 2px solid var(--ssml-editor-switch-active);
  outline-offset: 2px;
}
[data-ssml-editor] .ssml-editor-help-settings-summary {
  list-style: none;
}
[data-ssml-editor] .ssml-editor-help-settings-summary::-webkit-details-marker {
  display: none;
}
[data-ssml-editor] .ssml-editor-help-settings-summary:hover {
  background-color: var(--ssml-editor-preview-bg);
}
[data-ssml-editor] .ssml-editor-help-settings-summary:focus-visible {
  outline: 2px solid var(--ssml-editor-control-border);
  outline-offset: -2px;
}
[data-ssml-editor] .ssml-editor-help-settings-summary::before {
  content: "▸";
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  line-height: 1.45;
}
[data-ssml-editor]
  .ssml-editor-help-settings-accordion[open]
  > .ssml-editor-help-settings-summary::before {
  content: "▾";
}
[data-ssml-editor] .ssml-editor-visual-layout {
  display: grid;
  grid-template-columns: minmax(12rem, 0.35fr) minmax(16rem, 1fr);
  gap: 1rem;
}
[data-ssml-editor] .ssml-editor-visual-tree,
[data-ssml-editor] .ssml-editor-visual-form {
  display: grid;
  gap: 0.5rem;
  align-content: start;
}
[data-ssml-editor] .ssml-editor-visual-tree ul {
  margin: 0;
  padding-left: 1.25rem;
}
[data-ssml-editor] .ssml-editor-visual-tree button,
[data-ssml-editor] .ssml-editor-visual-breadcrumb button,
[data-ssml-editor] .ssml-editor-visual-actions button {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-visual-tree button[aria-current] {
  border-color: var(--ssml-editor-active-border);
  background: var(--ssml-editor-active-bg);
}
[data-ssml-editor] .ssml-editor-visual-breadcrumb,
[data-ssml-editor] .ssml-editor-visual-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
[data-ssml-editor] .ssml-editor-visual-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 6rem;
  padding: 0.5rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  font: inherit;
}
[data-ssml-editor] .ssml-editor-visual-errors {
  padding: 0.5rem;
  color: var(--ssml-editor-error);
  background: var(--ssml-editor-error-bg);
  border: 1px solid var(--ssml-editor-error);
  border-radius: 0.25rem;
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
  onSelectionChange?: (info: SelectionInfo) => void;
  /** Called with the selected partial SSML when the selection preview action is used. The action is disabled when omitted. */
  onPreviewSelection?: (ssml: string) => void;
  /** UI language. Japanese is used when omitted. */
  language?: SsmlEditorLanguage;
  /** UI locale. Japanese is used when omitted; takes precedence over the legacy language prop. */
  locale?: SsmlEditorLocale;
  /** Whether the toolbar is displayed. */
  showToolbar?: boolean;
  /** Whether toolbar action icons are displayed. */
  showToolbarIcons?: boolean;
  /** Whether toolbar action text labels are displayed. */
  showToolbarLabels?: boolean;
  /** Whether inline SSML decorations are displayed. The toolbar switch can change this at runtime. */
  showDecorations?: boolean;
  /** Whether SSML CodeLens quick controls are displayed. */
  enableCodeLens?: boolean;
  /** Controls which editor action buttons are displayed. Unspecified buttons are shown. */
  buttonVisibility?: SsmlEditorButtonVisibility;
  /** Monaco editor settings. */
  editorOptions?: SsmlEditorOptions;
  /** Alias for editorOptions. */
  settings?: SsmlEditorOptions;
  /** Fallback UI displayed while Monaco is loading. */
  loadingFallback?: ReactNode;
  /** Height of the Monaco editor. */
  height?: string | number;
  /** Minimum height of the Monaco editor container. */
  minHeight?: string | number;
  /** Whether the Monaco editor is read-only. */
  readOnly?: boolean;
  /** Selects the XML source editor or the structured visual editor. */
  editMode?: SsmlEditorEditMode;
  /** Monaco theme mode. */
  theme?: SsmlEditorTheme;
  /** Monaco editor font size. */
  fontSize?: number;
  /** Monaco editor word wrapping mode. */
  wordWrap?: SsmlEditorWordWrap;
  /** Monaco editor line number mode. */
  lineNumbers?: SsmlEditorLineNumbers;
  /** Whether the Monaco minimap is displayed. */
  minimap?: boolean;
  /** Whether Monaco automatically lays out when its container changes size. */
  automaticLayout?: boolean;
  /** Reorders all toolbar controls. Unlisted controls follow. */
  toolbarOrder?: readonly SsmlEditorButton[];
  /** Adds vertical separators between configured toolbar groups. */
  toolbarGroups?: readonly SsmlEditorToolbarGroup[];
  /** Reorders built-in and custom insertion menus. Unlisted insertions follow. */
  insertionOrder?: readonly string[];
  /** Visually groups insertion menus when toolbarGroups is not supplied. */
  insertionGroups?: readonly SsmlEditorInsertionGroup[];
  /** Replaces built-in insertion definitions with custom definitions by ID. */
  customInsertions?: SsmlEditorCustomInsertionCollection;
  /** Adds insertion definitions without replacing built-in definitions. */
  additionalInsertions?: SsmlEditorCustomInsertionCollection;
  /** Candidate style values shown by the built-in emotion insertion. */
  emotionStyles?: readonly string[];
  /** Class name applied to the editor container. */
  className?: string;
  /** Inline styles applied to the editor container. */
  style?: CSSProperties;
  /** Class name applied to the toolbar. */
  toolbarClassName?: string;
  /** Inline styles applied to the toolbar. */
  toolbarStyle?: CSSProperties;
  /** Class name applied to the editor display area. */
  displayClassName?: string;
  /** Inline styles applied to the editor display area. */
  displayStyle?: CSSProperties;
}

export type SsmlEditorEditMode = "code" | "visual";

export interface SelectionInfo {
  selectedText: string;
  characterCount: number;
  hasSelection: boolean;
}

export interface SsmlEditorRef {
  getSelectedSsml(): string | null;
  getCurrentLineSsml(): string | null;
  getFullSsml(): string;
}

interface ToolbarDecorationsSwitchProps {
  copy: EditorCopy;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  decorationsVisible: boolean;
  onVisibilityChange: (visible: boolean) => void;
}

function ToolbarDecorationsSwitch({
  copy,
  showToolbarIcons,
  showToolbarText,
  decorationsVisible,
  onVisibilityChange,
}: ToolbarDecorationsSwitchProps): ReactElement {
  return (
    <div style={styles.toolbarSwitch}>
      {showToolbarIcons && (
        <span style={styles.toolbarIcon} aria-hidden="true">
          ☆
        </span>
      )}
      {showToolbarText && <span>{copy.decorations}</span>}
      <button
        type="button"
        className="ssml-editor-switch-track"
        style={styles.toolbarSwitchTrack}
        role="switch"
        aria-checked={decorationsVisible}
        aria-label={copy.decorations}
        title={decorationsVisible ? copy.decorationsHideTitle : copy.decorationsShowTitle}
        onClick={() => onVisibilityChange(!decorationsVisible)}
      >
        <span className="ssml-editor-switch-thumb" style={styles.toolbarSwitchThumb} aria-hidden="true" />
      </button>
    </div>
  );
}

export const SsmlEditor = forwardRef<SsmlEditorRef, SsmlEditorProps>(function SsmlEditor(
  {
    document,
    onChange,
    onSsmlChange,
    onSelectionChange,
    onPreviewSelection,
    language: languageProp,
    locale: localeProp,
    showToolbar = true,
    showToolbarIcons = true,
    showToolbarLabels = false,
    showDecorations = false,
    enableCodeLens = true,
    buttonVisibility,
    editorOptions,
    settings,
    height,
    minHeight,
    readOnly,
    theme,
    fontSize,
    wordWrap,
    lineNumbers,
    minimap,
    automaticLayout,
    toolbarOrder,
    toolbarGroups,
    insertionOrder,
    insertionGroups,
    customInsertions,
    additionalInsertions,
    emotionStyles,
    className,
    style,
    toolbarClassName,
    toolbarStyle,
    displayClassName,
    displayStyle,
    loadingFallback,
    editMode: editModeProp = "code",
  }: SsmlEditorProps,
  ref,
): ReactElement {
  const [editMode, setEditMode] = useState<SsmlEditorEditMode>(editModeProp);
  useEffect(() => setEditMode(editModeProp), [editModeProp]);
  const resolvedEditorOptions: SsmlEditorOptions = {
    ...settings,
    ...editorOptions,
    ...(height === undefined ? {} : { height }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(readOnly === undefined ? {} : { readOnly }),
    ...(theme === undefined ? {} : { theme }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(wordWrap === undefined ? {} : { wordWrap }),
    ...(lineNumbers === undefined ? {} : { lineNumbers }),
    ...(minimap === undefined ? {} : { minimap }),
    ...(automaticLayout === undefined ? {} : { automaticLayout }),
  };
  const language = localeProp ?? languageProp ?? DEFAULT_LOCALE;
  const copy = EDITOR_COPY[language];
  const showToolbarText = showToolbarLabels || !showToolbarIcons;
  const resolvedTheme = resolvedEditorOptions.theme ?? "system";
  const editorMinHeight = resolvedEditorOptions.minHeight ?? "8rem";
  const editorHeight = resolvedEditorOptions.height ?? editorMinHeight;
  const isReadOnly = resolvedEditorOptions.readOnly ?? false;
  const toolbarButtonStyle = showToolbarText
    ? styles.toolbarButton
    : { ...styles.toolbarButton, ...styles.toolbarIconOnly };
  const configuredInsertions = getConfiguredInsertions(emotionStyles, customInsertions, additionalInsertions);
  const visibleInsertions = orderInsertions(configuredInsertions, insertionOrder).filter((insertion) =>
    isSsmlEditorButtonVisible(buttonVisibility, insertion.id),
  );
  const insertionById = new Map(visibleInsertions.map((insertion) => [insertion.id, insertion]));
  const configuredInsertionGroups = insertionGroups ?? DEFAULT_INSERTION_GROUPS;
  const groupedInsertionIds = new Set<string>();
  const visibleInsertionGroups = configuredInsertionGroups
    .map((group) => {
      const groupInsertionIds = new Set(group.insertionIds);
      const candidates =
        insertionOrder && insertionOrder.length > 0
          ? visibleInsertions.filter((insertion) => groupInsertionIds.has(insertion.id))
          : group.insertionIds
              .map((id) => insertionById.get(id))
              .filter((insertion): insertion is SsmlInsertionDefinition => insertion !== undefined);
      const insertions = candidates.filter((insertion) => {
        if (groupedInsertionIds.has(insertion.id)) {
          return false;
        }
        groupedInsertionIds.add(insertion.id);
        return true;
      });

      return { group, insertions };
    })
    .filter(({ insertions }) => insertions.length > 0);
  const ungroupedInsertions = visibleInsertions.filter((insertion) => !groupedInsertionIds.has(insertion.id));
  const toolbarActionIds = ["undo", "redo", "clearAll", "format", "decorations", "help"] as const;
  const defaultToolbarOrder = [
    "undo",
    "redo",
    ...visibleInsertionGroups.flatMap(({ insertions }) => insertions.map((insertion) => insertion.id)),
    ...ungroupedInsertions.map((insertion) => insertion.id),
    "clearAll",
    "format",
    "decorations",
    "help",
  ];
  const visibleToolbarIds = new Set<string>([
    ...visibleInsertions.map((insertion) => insertion.id),
    ...toolbarActionIds.filter((id) => isSsmlEditorButtonVisible(buttonVisibility, id)),
  ]);
  const toolbarItemIds = orderToolbarButtons(
    defaultToolbarOrder.filter((id) => visibleToolbarIds.has(id)),
    toolbarOrder,
  );
  const effectiveToolbarGroups = toolbarGroups ?? createDefaultToolbarGroups(configuredInsertionGroups);
  const toolbarGroupByButtonId = new Map<string, string>();
  for (const group of effectiveToolbarGroups) {
    for (const buttonId of group.buttonIds) {
      if (!toolbarGroupByButtonId.has(buttonId)) {
        toolbarGroupByButtonId.set(buttonId, group.id);
      }
    }
  }
  const helpInsertions = [
    ...visibleInsertionGroups.flatMap(({ insertions }) => insertions),
    ...ungroupedInsertions,
  ].filter(
    (insertion, index, insertions) => insertions.findIndex((candidate) => candidate.id === insertion.id) === index,
  );

  const {
    editorRef,
    draftDocument,
    text,
    selectionOverlay,
    activeTags,
    isDarkTheme,
    decorationsVisible,
    setDecorationsVisible,
    isHelpOpen,
    setIsHelpOpen,
    syntaxError,
    setSyntaxError,
    helpPanelId,
    commit,
    handleTextChange,
    handleInsert,
    handleInsertBreak,
    handleInsertProsody,
    handleInsertText,
    handleClear,
    handleFormat,
    handleUndo,
    handleRedo,
    previewSelection,
    canPreviewSelection,
    refreshSelectionOverlay,
    updateActiveTags,
    getSelectedSsml,
    getCurrentLineSsml,
    getFullSsml,
    getOuterVoiceName,
    handleCodeLensAction,
    openPopoverId,
    popoverVoiceName,
    popoverPosition,
    isPopoverOpen,
    togglePopover,
    closePopover,
    setPopoverMenuRef,
  } = useSsmlEditorState({
    document,
    resolvedTheme,
    showDecorations,
    onChange,
    onSsmlChange,
    onSelectionChange,
    onPreviewSelection,
    injectTheme: injectEditorTheme,
  });
  const { onMount } = useSsmlMonaco({
    editorRef,
    language,
    text,
    decorationsVisible,
    getOuterVoiceName,
    onSelectionOverlayChange: refreshSelectionOverlay,
    onActiveTagsChange: updateActiveTags,
    onSyntaxErrorChange: setSyntaxError,
    enableCodeLens,
    onOpenPopover: handleCodeLensAction,
  });

  useImperativeHandle(
    ref,
    () => ({
      getSelectedSsml,
      getCurrentLineSsml,
      getFullSsml,
    }),
    [getCurrentLineSsml, getFullSsml, getSelectedSsml],
  );

  const renderInsertion = (insertion: SsmlEditorInsertionDefinition): ReactElement => {
    const isTimingPopover = insertion.tagName !== undefined && TIMING_POPOVER_TAGS.has(insertion.tagName);
    const isProsodyPopover = insertion.tagName !== undefined && PROSODY_POPOVER_TAGS.has(insertion.tagName);
    const isTextPopover = insertion.tagName !== undefined && TEXT_POPOVER_TAGS.has(insertion.tagName);
    const insertionButtonStyle =
      insertion.tagName && activeTags.has(insertion.tagName.toLowerCase())
        ? { ...toolbarButtonStyle, ...styles.toolbarButtonActive }
        : toolbarButtonStyle;
    const props = {
      language,
      isDarkTheme,
      showToolbarIcons,
      showToolbarText,
      toolbarButtonStyle: insertionButtonStyle,
      emptyOptionsMessage: copy.noAvailableOptions,
      isReadOnly,
      openPopoverId,
      menuPosition: popoverPosition,
      menuRef: setPopoverMenuRef,
      onToggle: togglePopover,
      onClose: closePopover,
      onApply: isTimingPopover
        ? handleInsertBreak
        : isProsodyPopover
          ? handleInsertProsody
          : isTextPopover
            ? handleInsertText
            : handleInsert,
    };

    if (isTimingPopover) {
      return <TimingPopovers {...props} insertions={[insertion]} />;
    }
    if (isProsodyPopover) {
      return <ProsodyPopovers {...props} insertions={[insertion]} voiceName={popoverVoiceName} />;
    }
    if (isTextPopover) {
      return <TextPopovers {...props} insertions={[insertion]} />;
    }
    return (
      <InsertionPopover
        {...props}
        insertion={insertion}
        isOpen={isPopoverOpen(insertion.id)}
        onToggle={(trigger) => togglePopover(insertion.id, trigger)}
      />
    );
  };

  const toolbarItemRenderers = new Map<string, () => ReactElement>([
    [
      "undo",
      () => (
        <button
          key="undo"
          type="button"
          style={toolbarButtonStyle}
          aria-label={copy.undo}
          title={copy.undoTitle}
          disabled={isReadOnly}
          onClick={() => {
            if (!isReadOnly) {
              handleUndo();
            }
          }}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ↩
            </span>
          )}
          {showToolbarText && <span>{copy.undo}</span>}
        </button>
      ),
    ],
    [
      "redo",
      () => (
        <button
          key="redo"
          type="button"
          style={toolbarButtonStyle}
          aria-label={copy.redo}
          title={copy.redoTitle}
          disabled={isReadOnly}
          onClick={() => {
            if (!isReadOnly) {
              handleRedo();
            }
          }}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ↪
            </span>
          )}
          {showToolbarText && <span>{copy.redo}</span>}
        </button>
      ),
    ],
    [
      "clearAll",
      () => (
        <button
          key="clearAll"
          type="button"
          style={toolbarButtonStyle}
          aria-label={copy.clearAll}
          title={copy.clearAllTitle}
          disabled={isReadOnly}
          onClick={() => {
            if (!isReadOnly) {
              handleClear();
            }
          }}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ×
            </span>
          )}
          {showToolbarText && <span>{copy.clearAll}</span>}
        </button>
      ),
    ],
    [
      "format",
      () => (
        <button
          key="format"
          type="button"
          style={toolbarButtonStyle}
          aria-label={copy.format}
          title={copy.formatTitle}
          disabled={isReadOnly}
          onClick={() => {
            if (!isReadOnly) {
              handleFormat();
            }
          }}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ≡
            </span>
          )}
          {showToolbarText && <span>{copy.format}</span>}
        </button>
      ),
    ],
    [
      "decorations",
      () => (
        <ToolbarDecorationsSwitch
          key="decorations"
          copy={copy}
          showToolbarIcons={showToolbarIcons}
          showToolbarText={showToolbarText}
          decorationsVisible={decorationsVisible}
          onVisibilityChange={setDecorationsVisible}
        />
      ),
    ],
    [
      "help",
      () => (
        <button
          key="help"
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
      ),
    ],
  ]);
  for (const insertion of visibleInsertions) {
    toolbarItemRenderers.set(insertion.id, () => renderInsertion(insertion));
  }
  const renderToolbarItems = (): ReactElement[] => {
    let previousRenderedGroupId = UNGROUPED_TOOLBAR_GROUP;
    let hasRenderedToolbarItem = false;
    const renderedItems: ReactElement[] = [];

    for (const id of toolbarItemIds) {
      const render = toolbarItemRenderers.get(id);
      if (!render) {
        continue;
      }

      const groupId = toolbarGroupByButtonId.get(id) ?? UNGROUPED_TOOLBAR_GROUP;
      const showSeparator = hasRenderedToolbarItem && groupId !== previousRenderedGroupId;
      previousRenderedGroupId = groupId;
      hasRenderedToolbarItem = true;
      renderedItems.push(
        <Fragment key={id}>
          {showSeparator && <span style={styles.toolbarSeparator} aria-hidden="true" />}
          {render()}
        </Fragment>,
      );
    }

    return renderedItems;
  };

  return (
    <section
      className={className}
      style={{ ...styles.container, ...style }}
      aria-label={copy.editorAriaLabel}
      data-ssml-editor=""
      data-theme={isDarkTheme ? "dark" : "light"}
    >
      {showToolbar && (
        <div
          className={toolbarClassName}
          style={{ ...styles.toolbarContainer, ...toolbarStyle }}
          data-ssml-editor-toolbar=""
        >
          <div
            style={styles.toolbarActions}
            role="toolbar"
            aria-label={copy.toolbarAriaLabel}
            data-ssml-editor-toolbar-actions=""
          >
            {renderToolbarItems()}
            <span style={styles.toolbarSeparator} aria-hidden="true" />
            <button
              type="button"
              style={editMode === "visual" ? { ...toolbarButtonStyle, ...styles.toolbarButtonActive } : toolbarButtonStyle}
              aria-pressed={editMode === "visual"}
              onClick={() => setEditMode("visual")}
            >
              Visual
            </button>
            <button
              type="button"
              style={editMode === "code" ? { ...toolbarButtonStyle, ...styles.toolbarButtonActive } : toolbarButtonStyle}
              aria-pressed={editMode === "code"}
              onClick={() => setEditMode("code")}
            >
              Code
            </button>
          </div>
        </div>
      )}
      <div className={displayClassName} style={{ ...styles.display, ...displayStyle }} data-ssml-editor-display="">
        {isHelpOpen && isSsmlEditorButtonVisible(buttonVisibility, "help") && (
          <section id={helpPanelId} style={styles.helpPanel} aria-label={copy.helpHeading}>
            <h3 style={styles.helpHeading}>{copy.helpHeading}</h3>
            <p style={styles.helpDescription}>{copy.helpDescription}</p>
            {helpInsertions.length > 0 && (
              <ul style={styles.helpList}>
                {helpInsertions.map((insertion) => (
                  <li key={insertion.id} style={styles.helpItem}>
                    <details className="ssml-editor-help-settings-accordion" style={styles.helpSettingsAccordion}>
                      <summary className="ssml-editor-help-settings-summary" style={styles.helpSettingsSummary}>
                        <span style={styles.helpIcon} aria-hidden="true">
                          {insertion.icon}
                        </span>
                        <span style={styles.helpSettingsSummaryContent}>
                          <strong>{insertion.labels[language]}</strong>{" "}
                          {insertion.tagName && (
                            <>
                              <code>{`<${insertion.tagName}${insertion.selfClosing ? "/>" : ">"}`}</code> —{" "}
                            </>
                          )}
                          {insertion.descriptions[language]}
                        </span>
                      </summary>
                      <p style={styles.helpSettingsDescription}>
                        <strong>{copy.parameters}:</strong> {insertion.parameterDescription[language]}
                      </p>
                      <ul style={styles.helpSettingsList}>
                        {insertion.options.map((option) => (
                          <li key={option.value}>
                            <strong>{option.labels[language]}</strong>
                            {option.descriptions && <> — {option.descriptions[language]}</>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {editMode === "visual" ? (
          <div style={styles.visual}>
            <VisualSsmlEditor
              document={draftDocument}
              readOnly={isReadOnly}
              onChange={commit}
              onPreviewSelection={onPreviewSelection}
            />
          </div>
        ) : (
        <div style={{ ...styles.editor, minHeight: editorMinHeight }}>
          <Editor
            height={editorHeight}
            language="xml"
            theme={isDarkTheme ? "vs-dark" : "light"}
            options={{
              automaticLayout: resolvedEditorOptions.automaticLayout ?? true,
              autoClosingBrackets: "never",
              fontSize: resolvedEditorOptions.fontSize,
              hover: { enabled: "on" },
              inlayHints: { enabled: decorationsVisible ? "on" : "off" },
              lineNumbers: resolvedEditorOptions.lineNumbers,
              minimap: {
                enabled: resolvedEditorOptions.minimap ?? true,
              },
              readOnly: isReadOnly,
              wordWrap: resolvedEditorOptions.wordWrap,
            }}
            value={text}
            loading={loadingFallback}
            onMount={onMount}
            onChange={(value) => handleTextChange(value ?? "")}
          />
          {selectionOverlay.hasSelection && selectionOverlay.position && (
            <div
              role="toolbar"
              aria-label={copy.selectionActions}
              data-ssml-editor-selection-actions=""
              style={{
                ...styles.selectionActions,
                top: selectionOverlay.position.top,
                left: selectionOverlay.position.left,
                transform:
                  selectionOverlay.placement === "above"
                    ? "translateY(calc(-100% - 0.5rem))"
                    : `translateY(calc(${selectionOverlay.position.height}px + 0.5rem))`,
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              <span style={styles.selectionCount} aria-live="polite">
                {selectionOverlay.characterCount}
                {copy.selectionCountSuffix}
              </span>
              <span style={styles.selectionActionsDivider} aria-hidden="true" />
              <button
                type="button"
                style={styles.selectionActionButton}
                title={copy.previewSelectionTitle}
                disabled={!canPreviewSelection}
                onClick={previewSelection}
              >
                <span style={styles.selectionActionIcon} aria-hidden="true">
                  ▶
                </span>
                {copy.previewSelection}
              </button>
            </div>
          )}
        </div>
        )}
        {syntaxError && (
          <p style={styles.error} role="alert">
            {copy.syntaxError}: {syntaxError.message}
          </p>
        )}
      </div>
    </section>
  );
});
