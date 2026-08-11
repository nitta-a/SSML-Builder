import { Fragment, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { createPortal } from "react-dom";
import { buildPartialSsml, buildSsml, parseSsml, validateSsml } from "@ssml-builder/ssml-core";
import type {
  ProsodyElement,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  SsmlPartialContext,
  VoiceElement,
} from "@ssml-builder/ssml-core";
import { isSsmlEditorButtonVisible, type SsmlEditorButton, type SsmlEditorButtonVisibility } from "./buttonVisibility";
import { formatXmlFragment } from "./formatXml";
import {
  createQuickInsertionTemplate,
  QUICK_INSERTION_DEFINITIONS,
  type QuickInsertionDefinition,
  type QuickInsertionId,
  type QuickInsertionValues,
} from "./quickInsertions";
import { findSsmlHoverTarget, formatSsmlHover } from "./ssmlHover";
import { createSsmlInsertionEdit } from "./ssmlInsertion";

const DEFAULT_LANGUAGE = "ja";
const SSML_MARKER_OWNER = "ssml-builder";
const SELECTION_OVERLAY_ABOVE_THRESHOLD_LINES = 4;
const UNGROUPED_TOOLBAR_GROUP = "__ssml-editor-ungrouped__";
const EDITABLE_SSML_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SSML_SUFFIX = "</speak>";

export type SsmlEditorLanguage = "ja" | "en";

export type SsmlEditorLocalizedText = Readonly<Record<SsmlEditorLanguage, string>>;

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
  values: readonly string[] | Readonly<Record<string, SsmlEditorLocalizedText>>,
): readonly SsmlInsertionOption[] {
  if (Array.isArray(values)) {
    return values.map((value) => ({
      value,
      labels: { ja: value, en: value },
    }));
  }

  return Object.entries(values).map(([value, descriptions]) => ({
    value,
    labels: { ja: value, en: value },
    descriptions,
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
    options: createInsertionOptions({
      "500ms": {
        ja: "500ミリ秒の無音",
        en: "Inserts 500 milliseconds of silence.",
      },
      "1s": {
        ja: "1秒の無音",
        en: "Inserts one second of silence.",
      },
      "2s": {
        ja: "2秒の無音",
        en: "Inserts two seconds of silence.",
      },
      "3s": {
        ja: "3秒の無音",
        en: "Inserts three seconds of silence.",
      },
    }),
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
    options: createInsertionOptions({
      strong: {
        ja: "強い強調",
        en: "Applies strong emphasis.",
      },
      moderate: {
        ja: "中程度の強調",
        en: "Applies moderate emphasis.",
      },
      reduced: {
        ja: "弱めの強調",
        en: "Applies reduced emphasis.",
      },
      none: {
        ja: "強調なし",
        en: "Applies no emphasis.",
      },
    }),
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
    options: createInsertionOptions({
      "x-slow": {
        ja: "最も遅い速度",
        en: "Uses the slowest speech rate.",
      },
      slow: {
        ja: "遅い速度",
        en: "Uses a slow speech rate.",
      },
      medium: {
        ja: "標準的な速度",
        en: "Uses the standard speech rate.",
      },
      fast: {
        ja: "速い速度",
        en: "Uses a fast speech rate.",
      },
      "x-fast": {
        ja: "最も速い速度",
        en: "Uses the fastest speech rate.",
      },
    }),
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
    options: createInsertionOptions({
      "+2st": {
        ja: "基準の声の高さより2半音上",
        en: "Raises the pitch by two semitones.",
      },
      "-2st": {
        ja: "基準の声の高さより2半音下",
        en: "Lowers the pitch by two semitones.",
      },
      "0st": {
        ja: "基準の声の高さ",
        en: "Keeps the baseline pitch.",
      },
      "+4st": {
        ja: "基準の声の高さより4半音上",
        en: "Raises the pitch by four semitones.",
      },
      "-4st": {
        ja: "基準の声の高さより4半音下",
        en: "Lowers the pitch by four semitones.",
      },
      "+8st": {
        ja: "基準の声の高さより8半音上",
        en: "Raises the pitch by eight semitones.",
      },
      "-8st": {
        ja: "基準の声の高さより8半音下",
        en: "Lowers the pitch by eight semitones.",
      },
      "+12st": {
        ja: "基準の声の高さより12半音上",
        en: "Raises the pitch by twelve semitones.",
      },
      "-12st": {
        ja: "基準の声の高さより12半音下",
        en: "Lowers the pitch by twelve semitones.",
      },
    }),
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
    options: createInsertionOptions({
      silent: {
        ja: "無音",
        en: "Makes the selected text silent.",
      },
      "x-soft": {
        ja: "最も小さい音量",
        en: "Uses the quietest volume.",
      },
      soft: {
        ja: "小さい音量",
        en: "Uses a soft volume.",
      },
      medium: {
        ja: "標準的な音量",
        en: "Uses the standard volume.",
      },
      loud: {
        ja: "大きい音量",
        en: "Uses a loud volume.",
      },
      "x-loud": {
        ja: "最も大きい音量",
        en: "Uses the loudest volume.",
      },
    }),
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
    options: createInsertionOptions({
      cheerful: {
        ja: "明るく元気なスタイル",
        en: "Uses a cheerful style.",
      },
      friendly: {
        ja: "親しみやすいスタイル",
        en: "Uses a friendly style.",
      },
      calm: {
        ja: "穏やかなスタイル",
        en: "Uses a calm style.",
      },
      sad: {
        ja: "悲しげなスタイル",
        en: "Uses a sad style.",
      },
      angry: {
        ja: "怒ったようなスタイル",
        en: "Uses an angry style.",
      },
      excited: {
        ja: "興奮したスタイル",
        en: "Uses an excited style.",
      },
      serious: {
        ja: "真剣なスタイル",
        en: "Uses a serious style.",
      },
    }),
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
    options: createInsertionOptions({
      characters: {
        ja: "1文字ずつの読み上げ",
        en: "Speaks the characters one by one.",
      },
      "spell-out": {
        ja: "綴りの読み上げ（1文字ずつ）",
        en: "Spells out the text character by character.",
      },
      cardinal: {
        ja: "基数としての読み上げ",
        en: "Speaks the value as a cardinal number.",
      },
      ordinal: {
        ja: "序数としての読み上げ",
        en: "Speaks the value as an ordinal number.",
      },
      number: {
        ja: "数値としての読み上げ",
        en: "Speaks the value as a number.",
      },
      date: {
        ja: "日付としての読み上げ",
        en: "Speaks the value as a date.",
      },
      time: {
        ja: "時刻としての読み上げ",
        en: "Speaks the value as a time.",
      },
      telephone: {
        ja: "電話番号としての読み上げ",
        en: "Speaks the value as a telephone number.",
      },
      fraction: {
        ja: "分数としての読み上げ",
        en: "Speaks the value as a fraction.",
      },
      address: {
        ja: "住所としての読み上げ",
        en: "Speaks the value as an address.",
      },
      name: {
        ja: "名前としての読み上げ",
        en: "Speaks the value as a name.",
      },
      currency: {
        ja: "通貨としての読み上げ",
        en: "Speaks the value as currency.",
      },
    }),
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
    options: createInsertionOptions({
      "ja-JP": {
        ja: "日本語（日本）で読み上げます。",
        en: "Speaks the text in Japanese (Japan).",
      },
      "en-US": {
        ja: "英語（米国）で読み上げます。",
        en: "Speaks the text in English (United States).",
      },
      "de-DE": {
        ja: "ドイツ語（ドイツ）で読み上げます。",
        en: "Speaks the text in German (Germany).",
      },
      "fr-FR": {
        ja: "フランス語（フランス）で読み上げます。",
        en: "Speaks the text in French (France).",
      },
    }),
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
    options: createInsertionOptions({
      "300ms": {
        ja: "先頭に300ミリ秒の無音を挿入します。",
        en: "Inserts 300 milliseconds of leading silence.",
      },
      "500ms": {
        ja: "先頭に500ミリ秒の無音を挿入します。",
        en: "Inserts 500 milliseconds of leading silence.",
      },
      "1s": {
        ja: "先頭に1秒の無音を挿入します。",
        en: "Inserts one second of leading silence.",
      },
    }),
    createTemplate: (value) => ({
      prefix: `<mstts:silence type="Leading" value="${value}"/>`,
      suffix: "",
      mode: "insert",
    }),
  },
] satisfies readonly SsmlInsertionDefinition[];

const DEFAULT_INSERTION_GROUPS = [
  {
    id: "pauses",
    labels: { ja: "間・無音", en: "Pauses" },
    insertionIds: ["break", "mstts:silence"],
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

function getInsertionTitle(insertion: SsmlInsertionDefinition, language: SsmlEditorLanguage): string {
  if (insertion.titles) {
    return insertion.titles[language];
  }

  const tag = insertion.tagName ? ` <${insertion.tagName}${insertion.selfClosing ? "/>" : ">"}` : "";
  return `${insertion.labels[language]}${tag} — ${insertion.descriptions[language]}`;
}

type EditorCopy = {
  editorAriaLabel: string;
  toolbarAriaLabel: string;
  undo: string;
  undoTitle: string;
  redo: string;
  redoTitle: string;
  clearAll: string;
  clearAllTitle: string;
  help: string;
  helpTitle: string;
  helpHeading: string;
  helpDescription: string;
  parameters: string;
  format: string;
  formatTitle: string;
  decorations: string;
  decorationsShowTitle: string;
  decorationsHideTitle: string;
  syntaxError: string;
  selectionActions: string;
  selectionCountSuffix: string;
  previewSelection: string;
  previewSelectionTitle: string;
  quickInsertions: string;
  quickBreak: string;
  quickEmphasis: string;
  quickProsody: string;
  quickExpressAs: string;
  quickInsertionPopoverDescription: string;
  quickInsertionSelectPlaceholder: string;
  quickInsertionCancel: string;
  quickInsertionApply: string;
  quickInsertionSelectionRequired: string;
};

const EDITOR_COPY: Record<SsmlEditorLanguage, EditorCopy> = {
  ja: {
    editorAriaLabel: "SSMLエディター",
    toolbarAriaLabel: "SSMLツールバー",
    clearAll: "全てクリア",
    clearAllTitle: "XML要素を削除して本文を残す",
    undo: "元に戻す",
    undoTitle: "直前の変更を元に戻す",
    redo: "やり直す",
    redoTitle: "元に戻した変更をやり直す",
    help: "説明",
    helpTitle: "ボタンとパラメータの説明を表示",
    helpHeading: "ボタンとパラメータの説明",
    helpDescription: "各コントロールの機能とパラメータを確認できます。",
    parameters: "パラメータ",
    format: "フォーマット",
    formatTitle: "本文のXMLを改行して見やすく表示",
    decorations: "装飾",
    decorationsShowTitle: "インライン装飾を表示",
    decorationsHideTitle: "インライン装飾を非表示",
    syntaxError: "構文エラー",
    selectionActions: "選択範囲の操作",
    selectionCountSuffix: "文字",
    previewSelection: "選択部分を試聴",
    previewSelectionTitle: "選択部分のSSMLを試聴",
    quickInsertions: "タグをクイック挿入",
    quickBreak: "break",
    quickEmphasis: "emphasis",
    quickProsody: "prosody",
    quickExpressAs: "express-as",
    quickInsertionPopoverDescription: "挿入する属性をプリセットから選択してください。",
    quickInsertionSelectPlaceholder: "指定しない",
    quickInsertionCancel: "キャンセル",
    quickInsertionApply: "挿入",
    quickInsertionSelectionRequired: "少なくとも1つの属性値を選択してください。",
  },
  en: {
    editorAriaLabel: "SSML editor",
    toolbarAriaLabel: "SSML toolbar",
    clearAll: "Clear all",
    clearAllTitle: "Remove XML elements and keep the text",
    undo: "Undo",
    undoTitle: "Undo the last change",
    redo: "Redo",
    redoTitle: "Redo the last undone change",
    help: "Help",
    helpTitle: "Show button and parameter descriptions",
    helpHeading: "Button and parameter descriptions",
    helpDescription: "Review what each control does and its parameters.",
    parameters: "Parameters",
    format: "Format",
    formatTitle: "Format the XML in the editor",
    decorations: "Decorations",
    decorationsShowTitle: "Show inline decorations",
    decorationsHideTitle: "Hide inline decorations",
    syntaxError: "Syntax error",
    selectionActions: "Selection actions",
    selectionCountSuffix: " characters",
    previewSelection: "Preview selection",
    previewSelectionTitle: "Preview the selected SSML",
    quickInsertions: "Quick tag insertion",
    quickBreak: "break",
    quickEmphasis: "emphasis",
    quickProsody: "prosody",
    quickExpressAs: "express-as",
    quickInsertionPopoverDescription: "Select the attributes to insert from the available presets.",
    quickInsertionSelectPlaceholder: "Not set",
    quickInsertionCancel: "Cancel",
    quickInsertionApply: "Insert",
    quickInsertionSelectionRequired: "Select at least one attribute value.",
  },
};

type InlineBadgeCopy = {
  pause: string;
  pitch: string;
  prosody: string;
};

const INLINE_BADGE_COPY: Record<SsmlEditorLanguage, InlineBadgeCopy> = {
  ja: {
    pause: "間",
    pitch: "ピッチ変化",
    prosody: "声の調整",
  },
  en: {
    pause: "Pause",
    pitch: "Pitch change",
    prosody: "Prosody",
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
  --ssml-editor-error: #b91c1c;
  --ssml-editor-error-bg: #fef2f2;
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
  --ssml-editor-preview-bg: #111827;
  --ssml-editor-error: #fca5a5;
  --ssml-editor-error-bg: #450a0a;
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
  /** Whether toolbar action icons are displayed. */
  showToolbarIcons?: boolean;
  /** Whether toolbar action text labels are displayed. */
  showToolbarLabels?: boolean;
  /** Whether inline SSML decorations are displayed. The toolbar toggle can change this at runtime. */
  showDecorations?: boolean;
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

const styles: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    gap: "0.75rem",
    padding: "1rem",
    border: "1px solid var(--ssml-editor-border)",
    borderRadius: "0.5rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
  },
  toolbarContainer: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarSeparator: {
    width: "1px",
    height: "2.25rem",
    margin: "0 0.25rem",
    backgroundColor: "var(--ssml-editor-border)",
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
  display: {
    display: "grid",
    gap: "0.5rem",
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
    position: "fixed",
    zIndex: 9999,
    display: "grid",
    minWidth: "max-content",
    maxHeight: "min(24rem, calc(100vh - 1rem))",
    gap: "0.125rem",
    padding: "0.25rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.25rem 0.75rem rgb(0 0 0 / 20%)",
    overflowY: "auto",
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
    width: "100%",
    padding: "0.75rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-preview-bg)",
  },
  helpHeading: {
    margin: 0,
    fontSize: "1rem",
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
    listStyleType: "none",
    lineHeight: 1.45,
  },
  helpIcon: {
    display: "inline-flex",
    width: "1.25rem",
    justifyContent: "center",
    fontSize: "1.1rem",
    lineHeight: 1.45,
  },
  helpSettingsAccordion: {
    marginTop: "0.375rem",
    overflow: "hidden",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-control-bg)",
  },
  helpSettingsSummary: {
    display: "grid",
    gridTemplateColumns: "1rem 1.25rem minmax(0, 1fr)",
    columnGap: "0.5rem",
    alignItems: "start",
    padding: "0.5rem 0.625rem",
    cursor: "pointer",
  },
  helpSettingsSummaryContent: {
    minWidth: 0,
  },
  helpSettingsDescription: {
    margin: "0.5rem 0.75rem 0",
    fontSize: "0.875rem",
  },
  helpSettingsList: {
    display: "grid",
    gap: "0.125rem",
    margin: "0.25rem 0.75rem 0.75rem",
    paddingLeft: "1.25rem",
    fontSize: "0.875rem",
  },
  editor: {
    boxSizing: "border-box",
    position: "relative",
    width: "100%",
    minHeight: "8rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    overflow: "visible",
  },
  selectionActions: {
    position: "absolute",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.25rem",
    maxWidth: "calc(100% - 1rem)",
    padding: "0.25rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.375rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.25rem 0.75rem rgb(0 0 0 / 20%)",
  },
  selectionCount: {
    padding: "0.25rem 0.375rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  selectionActionsDivider: {
    width: "1px",
    height: "1.5rem",
    backgroundColor: "var(--ssml-editor-border)",
  },
  selectionActionButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    minHeight: "1.75rem",
    padding: "0.25rem 0.375rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
    font: "inherit",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  selectionActionIcon: {
    display: "inline-flex",
    width: "1rem",
    justifyContent: "center",
    lineHeight: 1,
  },
  selectionQuickGroup: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.25rem",
    margin: 0,
    padding: 0,
    border: 0,
  },
  quickInsertionPopoverAnchor: {
    position: "relative",
    display: "inline-flex",
  },
  quickInsertionPopover: {
    position: "absolute",
    zIndex: 9999,
    top: "calc(100% + 0.375rem)",
    left: 0,
    display: "grid",
    gap: "0.75rem",
    width: "min(20rem, calc(100vw - 1rem))",
    maxHeight: "min(24rem, calc(100vh - 1rem))",
    overflowY: "auto",
    padding: "0.625rem",
    margin: 0,
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.5rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.5rem 1.25rem rgb(0 0 0 / 25%)",
  },
  quickInsertionPopoverHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  quickInsertionPopoverHeading: {
    margin: 0,
    fontSize: "1rem",
  },
  quickInsertionPopoverDescription: {
    margin: 0,
    fontSize: "0.875rem",
    lineHeight: 1.5,
  },
  quickInsertionFields: {
    display: "grid",
    gap: "0.625rem",
  },
  quickInsertionField: {
    display: "grid",
    gap: "0.25rem",
  },
  quickInsertionFieldLabel: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  quickInsertionFieldDescription: {
    fontSize: "0.75rem",
    lineHeight: 1.4,
  },
  quickInsertionSelect: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "2.25rem",
    padding: "0.375rem 0.5rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
    font: "inherit",
  },
  quickInsertionPopoverActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.5rem",
  },
  quickInsertionPopoverError: {
    margin: 0,
    color: "var(--ssml-editor-error)",
    fontSize: "0.875rem",
  },
  error: {
    margin: 0,
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--ssml-editor-error)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-error)",
    backgroundColor: "var(--ssml-editor-error-bg)",
    lineHeight: 1.5,
  },
};

type MonacoEditor = Parameters<OnMount>[0];
type SsmlInsertion = SsmlInsertionDefinition;
type MonacoLanguages = Monaco["languages"];
type MonacoModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;
type MonacoDisposable = ReturnType<MonacoEditor["onDidChangeCursorSelection"]>;
type MonacoHoverProvider = Parameters<MonacoLanguages["registerHoverProvider"]>[1];
type MonacoHoverModel = Parameters<MonacoHoverProvider["provideHover"]>[0];
type MonacoHoverPosition = Parameters<MonacoHoverProvider["provideHover"]>[1];
type MonacoDecoration = Parameters<MonacoModel["deltaDecorations"]>[1][number];

interface HoverProviderRegistration {
  disposable: ReturnType<MonacoLanguages["registerHoverProvider"]>;
  references: number;
}

interface SelectionOverlayState extends SelectionInfo {
  position: {
    top: number;
    left: number;
    height: number;
  } | null;
  placement: "above" | "below";
}

interface QuickInsertionPopoverState {
  definition: QuickInsertionDefinition;
  values: QuickInsertionValues;
  error: string | null;
}

interface ToolbarInsertionMenuProps {
  insertion: SsmlInsertion;
  language: SsmlEditorLanguage;
  isDarkTheme: boolean;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  toolbarButtonStyle: CSSProperties;
  isReadOnly: boolean;
  onApply: (insertion: SsmlInsertion, option: SsmlInsertionOption) => void;
}

function ToolbarInsertionMenu({
  insertion,
  language,
  isDarkTheme,
  showToolbarIcons,
  showToolbarText,
  toolbarButtonStyle,
  isReadOnly,
  onApply,
}: ToolbarInsertionMenuProps): ReactElement {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const triggerBounds = trigger.getBoundingClientRect();
      setMenuPosition({
        top: triggerBounds.bottom + 4,
        left: triggerBounds.left,
      });
    };

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const menu = isOpen && menuPosition && typeof document !== "undefined" && (
    <div
      ref={menuRef}
      id={menuId}
      data-ssml-editor=""
      data-theme={isDarkTheme ? "dark" : "light"}
      style={{ ...styles.toolbarMenu, top: menuPosition.top, left: menuPosition.left }}
      role="menu"
      aria-label={insertion.labels[language]}
    >
      {insertion.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitem"
          style={styles.toolbarOption}
          title={option.descriptions?.[language] ?? insertion.descriptions[language]}
          disabled={isReadOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!isReadOnly) {
              onApply(insertion, option);
            }
            setIsOpen(false);
          }}
        >
          {option.labels[language]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div style={styles.toolbarDropdown}>
        <button
          ref={triggerRef}
          type="button"
          style={toolbarButtonStyle}
          title={getInsertionTitle(insertion, language)}
          aria-label={insertion.labels[language]}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          onClick={() => setIsOpen((open) => !open)}
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
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}

const EMPTY_SELECTION_OVERLAY: SelectionOverlayState = {
  selectedText: "",
  characterCount: 0,
  hasSelection: false,
  position: null,
  placement: "above",
};

const hoverProviderRegistrations = new WeakMap<MonacoLanguages, HoverProviderRegistration>();

function updateSsmlMarkers(
  monaco: Monaco,
  model: MonacoModel,
  value: string,
  syntaxError: SsmlSyntaxError | null,
): void {
  if (!syntaxError) {
    monaco.editor.setModelMarkers(model, SSML_MARKER_OWNER, []);
    return;
  }

  const startOffset = value.length === 0 ? 0 : Math.min(syntaxError.offset, value.length - 1);
  const endOffset = Math.min(startOffset + 1, value.length);
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);

  monaco.editor.setModelMarkers(model, SSML_MARKER_OWNER, [
    {
      message: syntaxError.message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
  ]);
}

function getSsmlAttributeValue(tag: string, attributeName: string): string | undefined {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedAttributeName}\\s*=\\s*("|')([^"']*)\\1`, "i"));
  return match?.[2];
}

function getSsmlInlineDecorations(model: MonacoModel, value: string, language: SsmlEditorLanguage): MonacoDecoration[] {
  const decorations: MonacoDecoration[] = [];
  const tagPattern = /<(break|prosody)\b[^>]*>/gi;
  const badgeCopy = INLINE_BADGE_COPY[language];

  for (const match of value.matchAll(tagPattern)) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const startOffset = match.index ?? 0;
    const endOffset = startOffset + tag.length;
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(endOffset);
    const pauseValue = getSsmlAttributeValue(tag, "time") ?? getSsmlAttributeValue(tag, "strength");
    const pitchValue =
      getSsmlAttributeValue(tag, "pitch") ??
      getSsmlAttributeValue(tag, "contour") ??
      getSsmlAttributeValue(tag, "range");
    const prosodyValue = pitchValue ?? getSsmlAttributeValue(tag, "rate") ?? getSsmlAttributeValue(tag, "volume");

    const badge =
      tagName === "break"
        ? `${badgeCopy.pause}${pauseValue ? ` ${pauseValue}` : ""}`
        : `${pitchValue ? badgeCopy.pitch : badgeCopy.prosody}${prosodyValue ? ` ${prosodyValue}` : ""}`;

    decorations.push({
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      options: {
        after: {
          content: ` ${badge}`,
          inlineClassName: `ssml-editor-inline-badge ssml-editor-inline-badge-${tagName === "break" ? "pause" : "prosody"}`,
        },
      },
    });
  }

  return decorations;
}

function updateSsmlInlineDecorations(
  model: MonacoModel,
  value: string,
  language: SsmlEditorLanguage,
  decorationIds: string[],
): string[] {
  return model.deltaDecorations(decorationIds, getSsmlInlineDecorations(model, value, language));
}

function clearSsmlInlineDecorations(model: MonacoModel, decorationIds: string[]): string[] {
  return model.deltaDecorations(decorationIds, []);
}

function syncSsmlInlineDecorations(
  model: MonacoModel,
  value: string,
  language: SsmlEditorLanguage,
  showDecorations: boolean,
  decorationIds: string[],
): string[] {
  return showDecorations
    ? updateSsmlInlineDecorations(model, value, language, decorationIds)
    : clearSsmlInlineDecorations(model, decorationIds);
}

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
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function getPartialContext(document: SsmlDocument): SsmlPartialContext {
  const children = getDocumentChildren(document);
  const voice = findFirstElement(children, isVoice);
  const prosody = findFirstElement(children, isProsody);
  const context: SsmlPartialContext = {
    version: document.version,
    lang: document.lang,
  };

  if (voice) {
    context.voice = {
      name: voice.name,
      effect: voice.effect,
      attributes: voice.attributes,
    };
  }

  if (prosody) {
    context.prosody = {
      rate: prosody.rate,
      pitch: prosody.pitch,
      volume: prosody.volume,
      contour: prosody.contour,
      range: prosody.range,
      attributes: prosody.attributes,
    };
  }

  return context;
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

function withChildren(document: SsmlDocument, children: SsmlNode[]): SsmlDocument {
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

function parseEditableText(value: string, lang: string): SsmlNode[] {
  try {
    const wrapper = buildSsml({
      version: "1.0",
      lang,
      children: [],
    });
    const openingTagEnd = wrapper.indexOf(">") + 1;
    const children = parseSsml(`${wrapper.slice(0, openingTagEnd)}${value}</speak>`).children ?? [];
    return children.some(isSsmlElement) ? children : [value];
  } catch {
    return [value];
  }
}

interface SsmlSyntaxError {
  message: string;
  offset: number;
}

function validateEditableText(value: string): SsmlSyntaxError | null {
  if (!value.includes("<")) {
    return null;
  }

  const source = `${EDITABLE_SSML_PREFIX}${value}${EDITABLE_SSML_SUFFIX}`;
  const validationError = validateSsml(source);
  if (!validationError) {
    return null;
  }

  return {
    message: validationError.message,
    offset: Math.min(Math.max(validationError.position - EDITABLE_SSML_PREFIX.length, 0), value.length),
  };
}

function serializeEditableText(nodes: SsmlNode[], lang: string): string {
  if (nodes.length === 1 && typeof nodes[0] === "string") {
    return nodes[0];
  }

  const xml = buildSsml({
    version: "1.0",
    lang,
    children: nodes,
  });
  const contentStart = xml.indexOf(">") + 1;
  return xml.slice(contentStart, -"</speak>".length);
}

function getEditableChildren(document: SsmlDocument): SsmlNode[] {
  const children = getDocumentChildren(document);
  const element = findFirstElement(children, isProsody) ?? findFirstElement(children, isVoice);
  return element?.children ?? children;
}

function getEditableText(document: SsmlDocument): string {
  return serializeEditableText(getEditableChildren(document), document.lang);
}

function updateText(document: SsmlDocument, value: string): SsmlDocument {
  const nextChildren = parseEditableText(value, document.lang);
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

function getSelectionInfo(editor: MonacoEditor): SelectionInfo {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return {
      selectedText: "",
      characterCount: 0,
      hasSelection: false,
    };
  }

  const selectedText = model.getValueInRange(selection);
  return {
    selectedText,
    characterCount: selectedText.length,
    hasSelection: selectedText.length > 0,
  };
}

function getSelectionOverlayState(editor: MonacoEditor): SelectionOverlayState {
  const info = getSelectionInfo(editor);
  if (!info.hasSelection) {
    return { ...info, position: null, placement: "above" };
  }

  const selection = editor.getSelection();
  if (!selection) {
    return { ...info, position: null, placement: "above" };
  }

  const position = editor.getScrolledVisiblePosition(selection.getStartPosition());
  if (!position) {
    return { ...info, position: null, placement: "above" };
  }

  const editorHeight = editor.getLayoutInfo().height;
  if (position.top + position.height < 0 || position.top > editorHeight) {
    return { ...info, position: null, placement: "above" };
  }

  return {
    ...info,
    position,
    placement: position.top >= SELECTION_OVERLAY_ABOVE_THRESHOLD_LINES * position.height ? "above" : "below",
  };
}

function getCurrentDocument(document: SsmlDocument, editor: MonacoEditor | null): SsmlDocument {
  const value = editor?.getValue();
  return value === undefined ? document : updateText(document, value);
}

function getCurrentLineText(editor: MonacoEditor): string | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return null;
  }

  const text = model.getLineContent(selection.positionLineNumber);
  return text.trim().length > 0 ? text : null;
}

function getSelectedText(editor: MonacoEditor): string | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return null;
  }

  const selectedText = model.getValueInRange(selection);
  return selectedText.length > 0 ? selectedText : getCurrentLineText(editor);
}

function getSelectedSsml(editor: MonacoEditor, document: SsmlDocument): string | null {
  const selectedText = getSelectedText(editor);
  return selectedText === null ? null : buildPartialSsml(selectedText, getPartialContext(document));
}

function getCurrentLineSsml(editor: MonacoEditor, document: SsmlDocument): string | null {
  const currentLineText = getCurrentLineText(editor);
  return currentLineText === null ? null : buildPartialSsml(currentLineText, getPartialContext(document));
}

function acquireSsmlHoverProvider(monaco: Monaco): () => void {
  const languages = monaco.languages;
  let registration = hoverProviderRegistrations.get(languages);

  if (!registration) {
    const provider: Parameters<MonacoLanguages["registerHoverProvider"]>[1] = {
      provideHover(model: MonacoHoverModel, position: MonacoHoverPosition) {
        const target = findSsmlHoverTarget(model.getValue(), position.lineNumber, position.column);
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

function applySsmlTemplate(editor: MonacoEditor, template: SsmlEditorInsertionTemplate): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return;
  }

  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const { replacement, selectionOffset } = createSsmlInsertionEdit(model.getValue(), startOffset, endOffset, template);

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

  const nextSelectionStart = model.getPositionAt(startOffset + selectionOffset);
  const nextSelectionEnd = model.getPositionAt(endOffset + selectionOffset);
  editor.setSelection({
    selectionStartLineNumber: nextSelectionStart.lineNumber,
    selectionStartColumn: nextSelectionStart.column,
    positionLineNumber: nextSelectionEnd.lineNumber,
    positionColumn: nextSelectionEnd.column,
  });
  editor.focus();
}

function applySsmlInsertion(editor: MonacoEditor, insertion: SsmlInsertion, option: SsmlInsertionOption): void {
  applySsmlTemplate(editor, insertion.createTemplate(option.value));
}

export const SsmlEditor = forwardRef<SsmlEditorRef, SsmlEditorProps>(function SsmlEditor(
  {
    document,
    onChange,
    onSsmlChange,
    onSelectionChange,
    onPreviewSelection,
    language = DEFAULT_LANGUAGE,
    showToolbarIcons = true,
    showToolbarLabels = false,
    showDecorations = false,
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
  }: SsmlEditorProps,
  ref,
): ReactElement {
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
  const helpPanelId = useId();
  const quickInsertionPopoverId = useId();
  const [draftDocument, setDraftDocument] = useState(document);
  const draftDocumentRef = useRef(document);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const releaseHoverProviderRef = useRef<(() => void) | null>(null);
  const selectionChangeRef = useRef<MonacoDisposable | null>(null);
  const selectionLayoutDisposablesRef = useRef<MonacoDisposable[]>([]);
  const inlineDecorationIdsRef = useRef<string[]>([]);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onPreviewSelectionRef = useRef(onPreviewSelection);
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayState>(EMPTY_SELECTION_OVERLAY);
  const [isDark, setIsDark] = useState(false);
  const [decorationsVisible, setDecorationsVisible] = useState(showDecorations);
  const [quickInsertionPopover, setQuickInsertionPopover] = useState<QuickInsertionPopoverState | null>(null);
  const quickInsertionAnchorRef = useRef<HTMLDivElement | null>(null);
  const quickInsertionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [syntaxError, setSyntaxError] = useState<SsmlSyntaxError | null>(null);
  draftDocumentRef.current = draftDocument;
  onSelectionChangeRef.current = onSelectionChange;
  onPreviewSelectionRef.current = onPreviewSelection;
  const copy = EDITOR_COPY[language];
  const showToolbarText = showToolbarLabels || !showToolbarIcons;
  const resolvedTheme = resolvedEditorOptions.theme ?? "system";
  const isDarkTheme = resolvedTheme === "dark" || (resolvedTheme === "system" && isDark);
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

  const refreshSelectionOverlay = (editor: MonacoEditor, notify: boolean): void => {
    const nextSelection = getSelectionOverlayState(editor);
    setSelectionOverlay(nextSelection);
    if (notify) {
      onSelectionChangeRef.current?.({
        selectedText: nextSelection.selectedText,
        characterCount: nextSelection.characterCount,
        hasSelection: nextSelection.hasSelection,
      });
    }
  };

  useEffect(() => {
    injectEditorTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    draftDocumentRef.current = document;
    setDraftDocument(document);
  }, [document]);

  useEffect(() => {
    setDecorationsVisible(showDecorations);
  }, [showDecorations]);

  useEffect(() => {
    if (!quickInsertionPopover) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !quickInsertionAnchorRef.current?.contains(target)) {
        setQuickInsertionPopover(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setQuickInsertionPopover(null);
        quickInsertionTriggerRef.current?.focus();
      }
    };

    globalThis.document.addEventListener("pointerdown", handlePointerDown);
    globalThis.document.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.document.removeEventListener("pointerdown", handlePointerDown);
      globalThis.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickInsertionPopover]);

  useEffect(() => {
    return () => {
      const model = editorRef.current?.getModel();
      if (model && monacoRef.current) {
        updateSsmlMarkers(monacoRef.current, model, model.getValue(), null);
        inlineDecorationIdsRef.current = clearSsmlInlineDecorations(model, inlineDecorationIdsRef.current);
      }
      selectionChangeRef.current?.dispose();
      selectionChangeRef.current = null;
      for (const disposable of selectionLayoutDisposablesRef.current) {
        disposable.dispose();
      }
      selectionLayoutDisposablesRef.current = [];
      releaseHoverProviderRef.current?.();
      releaseHoverProviderRef.current = null;
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  const text = getEditableText(draftDocument);

  useEffect(() => {
    const nextSyntaxError = validateEditableText(text);
    setSyntaxError(nextSyntaxError);

    const model = editorRef.current?.getModel();
    if (model && monacoRef.current) {
      updateSsmlMarkers(monacoRef.current, model, text, nextSyntaxError);
      inlineDecorationIdsRef.current = syncSsmlInlineDecorations(
        model,
        text,
        language,
        decorationsVisible,
        inlineDecorationIdsRef.current,
      );
    }
  }, [decorationsVisible, language, text]);

  const commit = (nextDocument: SsmlDocument): void => {
    draftDocumentRef.current = nextDocument;
    setDraftDocument(nextDocument);
    onChange?.(nextDocument);
    onSsmlChange?.(buildSsml(nextDocument));
  };

  const canPreviewSelection = onPreviewSelection !== undefined;
  const previewSelection = (): void => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const selectedSsml = getSelectedSsml(editor, draftDocumentRef.current);
    if (selectedSsml === null) {
      return;
    }

    onPreviewSelectionRef.current?.(selectedSsml);
  };

  useImperativeHandle(
    ref,
    () => ({
      getSelectedSsml: () => {
        const editor = editorRef.current;
        return editor ? getSelectedSsml(editor, draftDocumentRef.current) : null;
      },
      getCurrentLineSsml: () => {
        const editor = editorRef.current;
        return editor ? getCurrentLineSsml(editor, draftDocumentRef.current) : null;
      },
      getFullSsml: () => buildSsml(getCurrentDocument(draftDocumentRef.current, editorRef.current)),
    }),
    [],
  );

  const quickInsertionButtons = useMemo(
    () => [
      { id: "break" as const, icon: "⏸", label: copy.quickBreak },
      { id: "emphasis" as const, icon: "✦", label: copy.quickEmphasis },
      { id: "prosody" as const, icon: "↗", label: copy.quickProsody },
      { id: "express-as" as const, icon: "☺", label: copy.quickExpressAs },
    ],
    [copy],
  );

  const openQuickInsertionPopover = (id: QuickInsertionId): void => {
    const definition = QUICK_INSERTION_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!definition) {
      return;
    }

    setQuickInsertionPopover((current) => {
      if (current?.definition.id === id) {
        return null;
      }

      const values = Object.fromEntries(definition.fields.map((field) => [field.attribute, ""]));
      return { definition, values, error: null };
    });
  };

  const updateQuickInsertionValue = (attribute: string, value: string): void => {
    setQuickInsertionPopover((current) =>
      current === null
        ? current
        : {
            ...current,
            values: {
              ...current.values,
              [attribute]: value,
            },
            error: null,
          },
    );
  };

  const applyQuickInsertionPopover = (): void => {
    if (!quickInsertionPopover || !editorRef.current) {
      return;
    }

    const template = createQuickInsertionTemplate(quickInsertionPopover.definition, quickInsertionPopover.values);
    if (!template) {
      setQuickInsertionPopover((current) =>
        current === null ? current : { ...current, error: copy.quickInsertionSelectionRequired },
      );
      return;
    }

    applySsmlTemplate(editorRef.current, template);
    setQuickInsertionPopover(null);
  };

  const renderInsertion = (insertion: SsmlInsertion): ReactElement => (
    <ToolbarInsertionMenu
      key={insertion.id}
      insertion={insertion}
      language={language}
      isDarkTheme={isDarkTheme}
      showToolbarIcons={showToolbarIcons}
      showToolbarText={showToolbarText}
      toolbarButtonStyle={toolbarButtonStyle}
      isReadOnly={isReadOnly}
      onApply={(selectedInsertion, option) => {
        if (editorRef.current) {
          applySsmlInsertion(editorRef.current, selectedInsertion, option);
        }
      }}
    />
  );

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
              editorRef.current?.trigger("toolbar", "undo", null);
              editorRef.current?.focus();
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
              editorRef.current?.trigger("toolbar", "redo", null);
              editorRef.current?.focus();
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
              commit(clearDocument(draftDocument));
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
              const value = editorRef.current?.getValue() ?? getEditableText(draftDocument);
              commit(updateText(draftDocument, formatXmlFragment(value)));
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
        <button
          key="decorations"
          type="button"
          style={toolbarButtonStyle}
          aria-label={copy.decorations}
          title={decorationsVisible ? copy.decorationsHideTitle : copy.decorationsShowTitle}
          aria-pressed={decorationsVisible}
          onClick={() => setDecorationsVisible((visible) => !visible)}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ✧
            </span>
          )}
          {showToolbarText && <span>{copy.decorations}</span>}
        </button>
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
        </div>
      </div>
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
        <div style={{ ...styles.editor, minHeight: editorMinHeight }}>
          <Editor
            height={editorHeight}
            language="xml"
            theme={isDarkTheme ? "vs-dark" : "light"}
            options={{
              automaticLayout: resolvedEditorOptions.automaticLayout ?? true,
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
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              selectionChangeRef.current?.dispose();
              selectionChangeRef.current = editor.onDidChangeCursorSelection(() => {
                refreshSelectionOverlay(editor, true);
              });
              for (const disposable of selectionLayoutDisposablesRef.current) {
                disposable.dispose();
              }
              selectionLayoutDisposablesRef.current = [
                editor.onDidScrollChange(() => refreshSelectionOverlay(editor, false)),
                editor.onDidLayoutChange(() => refreshSelectionOverlay(editor, false)),
                editor.onDidContentSizeChange(() => refreshSelectionOverlay(editor, false)),
              ];
              releaseHoverProviderRef.current?.();
              releaseHoverProviderRef.current = acquireSsmlHoverProvider(monaco);
              const model = editor.getModel();
              const nextSyntaxError = validateEditableText(editor.getValue());
              setSyntaxError(nextSyntaxError);
              if (model) {
                updateSsmlMarkers(monaco, model, editor.getValue(), nextSyntaxError);
                inlineDecorationIdsRef.current = syncSsmlInlineDecorations(
                  model,
                  editor.getValue(),
                  language,
                  decorationsVisible,
                  inlineDecorationIdsRef.current,
                );
              }
              refreshSelectionOverlay(editor, true);
            }}
            onChange={(value) => {
              commit(updateText(draftDocument, value ?? ""));
              if (editorRef.current) {
                refreshSelectionOverlay(editorRef.current, false);
              }
            }}
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
              <span style={styles.selectionActionsDivider} aria-hidden="true" />
              <fieldset aria-label={copy.quickInsertions} style={styles.selectionQuickGroup}>
                <span style={styles.selectionCount}>{copy.quickInsertions}</span>
                {quickInsertionButtons.map((button) => (
                  <div
                    key={button.id}
                    ref={quickInsertionPopover?.definition.id === button.id ? quickInsertionAnchorRef : undefined}
                    style={styles.quickInsertionPopoverAnchor}
                  >
                    <button
                      ref={quickInsertionPopover?.definition.id === button.id ? quickInsertionTriggerRef : undefined}
                      type="button"
                      style={styles.selectionActionButton}
                      title={`<${button.id}>`}
                      aria-expanded={quickInsertionPopover?.definition.id === button.id}
                      aria-controls={
                        quickInsertionPopover?.definition.id === button.id
                          ? `${quickInsertionPopoverId}-${button.id}`
                          : undefined
                      }
                      disabled={isReadOnly}
                      onClick={() => {
                        if (!isReadOnly) {
                          openQuickInsertionPopover(button.id);
                        }
                      }}
                    >
                      <span style={styles.selectionActionIcon} aria-hidden="true">
                        {button.icon}
                      </span>
                      {button.label}
                    </button>
                    {quickInsertionPopover?.definition.id === button.id && (
                      <section
                        id={`${quickInsertionPopoverId}-${button.id}`}
                        aria-labelledby={`${quickInsertionPopoverId}-${button.id}-title`}
                        style={styles.quickInsertionPopover}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div style={styles.quickInsertionPopoverHeader}>
                          <h3
                            id={`${quickInsertionPopoverId}-${button.id}-title`}
                            style={styles.quickInsertionPopoverHeading}
                          >
                            {`<${quickInsertionPopover.definition.tagName}>`}
                          </h3>
                          <button
                            type="button"
                            style={styles.selectionActionButton}
                            aria-label={copy.quickInsertionCancel}
                            title={copy.quickInsertionCancel}
                            onClick={() => setQuickInsertionPopover(null)}
                          >
                            ×
                          </button>
                        </div>
                        <p style={styles.quickInsertionPopoverDescription}>{copy.quickInsertionPopoverDescription}</p>
                        <div style={styles.quickInsertionFields}>
                          {quickInsertionPopover.definition.fields.map((field) => {
                            const descriptionId = `${quickInsertionPopoverId}-${button.id}-${field.attribute}-description`;
                            return (
                              <label key={field.attribute} style={styles.quickInsertionField}>
                                <span style={styles.quickInsertionFieldLabel}>
                                  <span>
                                    <strong>{field.labels[language]}</strong> <code>{field.attribute}</code>
                                  </span>
                                </span>
                                <select
                                  style={styles.quickInsertionSelect}
                                  value={quickInsertionPopover.values[field.attribute] ?? ""}
                                  aria-describedby={descriptionId}
                                  onChange={(event) => updateQuickInsertionValue(field.attribute, event.target.value)}
                                >
                                  <option value="">{copy.quickInsertionSelectPlaceholder}</option>
                                  {field.options.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <span id={descriptionId} style={styles.quickInsertionFieldDescription}>
                                  {field.descriptions[language]}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {quickInsertionPopover.error && (
                          <p style={styles.quickInsertionPopoverError} role="alert">
                            {quickInsertionPopover.error}
                          </p>
                        )}
                        <div style={styles.quickInsertionPopoverActions}>
                          <button
                            type="button"
                            style={styles.selectionActionButton}
                            onClick={() => setQuickInsertionPopover(null)}
                          >
                            {copy.quickInsertionCancel}
                          </button>
                          <button
                            type="button"
                            style={styles.selectionActionButton}
                            onClick={applyQuickInsertionPopover}
                          >
                            {copy.quickInsertionApply}
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                ))}
              </fieldset>
            </div>
          )}
        </div>
        {syntaxError && (
          <p style={styles.error} role="alert">
            {copy.syntaxError}: {syntaxError.message}
          </p>
        )}
      </div>
    </section>
  );
});
