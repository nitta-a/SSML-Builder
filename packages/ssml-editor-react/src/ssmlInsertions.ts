import type { SsmlEditorLocalizedText } from "./locales";
import {
  BREAK_TIME_DESCRIPTIONS,
  BREAK_TIME_PRESETS,
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
): readonly SsmlEditorInsertionOption[] {
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
] satisfies readonly SsmlEditorInsertionDefinition[];

export const DEFAULT_INSERTION_GROUPS = [
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

export function createDefaultToolbarGroups(
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

export function getConfiguredInsertions(
  emotionStyles: readonly string[] | undefined,
  customInsertions: SsmlEditorCustomInsertionCollection | undefined,
  additionalInsertions: SsmlEditorCustomInsertionCollection | undefined,
): readonly SsmlEditorInsertionDefinition[] {
  const insertions = new Map<string, SsmlEditorInsertionDefinition>();
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

  const normalizeInsertion = (insertion: SsmlEditorCustomInsertion): SsmlEditorInsertionDefinition =>
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

export function orderInsertions(
  insertions: readonly SsmlEditorInsertionDefinition[],
  insertionOrder: readonly string[] | undefined,
): readonly SsmlEditorInsertionDefinition[] {
  if (!insertionOrder || insertionOrder.length === 0) {
    return insertions;
  }

  const insertionsById = new Map(insertions.map((insertion) => [insertion.id, insertion]));
  const ordered: SsmlEditorInsertionDefinition[] = [];
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

export function orderToolbarButtons(
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
