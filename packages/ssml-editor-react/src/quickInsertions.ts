export type QuickInsertionId = "break" | "prosody" | "express-as";
export type QuickInsertionMode = "insert" | "wrap";
export type QuickInsertionLocalizedText = Readonly<Record<"ja" | "en", string>>;

export interface QuickInsertionField {
  attribute: string;
  labels: QuickInsertionLocalizedText;
  descriptions: QuickInsertionLocalizedText;
  placeholders: QuickInsertionLocalizedText;
  options?: readonly string[];
}

export interface QuickInsertionDefinition {
  id: QuickInsertionId;
  tagName: string;
  mode: QuickInsertionMode;
  fields: readonly QuickInsertionField[];
  minAttributes: number;
  maxAttributes?: number;
}

export interface QuickInsertionTemplate {
  prefix: string;
  suffix: string;
  mode: QuickInsertionMode;
}

export type QuickInsertionValues = Readonly<Record<string, string>>;

function localizedText(ja: string, en: string): QuickInsertionLocalizedText {
  return { ja, en };
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

export const QUICK_INSERTION_DEFINITIONS: readonly QuickInsertionDefinition[] = [
  {
    id: "break",
    tagName: "break",
    mode: "insert",
    minAttributes: 1,
    maxAttributes: 1,
    fields: [
      {
        attribute: "time",
        labels: localizedText("時間", "Time"),
        descriptions: localizedText("無音にする時間です。", "The duration of the pause."),
        placeholders: localizedText("例: 500ms", "Example: 500ms"),
        options: ["500ms", "1s", "2s", "3s"],
      },
      {
        attribute: "strength",
        labels: localizedText("強さ", "Strength"),
        descriptions: localizedText("無音の相対的な強さです。", "The relative strength of the pause."),
        placeholders: localizedText("例: medium", "Example: medium"),
        options: ["none", "x-weak", "weak", "medium", "strong", "x-strong"],
      },
    ],
  },
  {
    id: "prosody",
    tagName: "prosody",
    mode: "wrap",
    minAttributes: 1,
    fields: [
      {
        attribute: "rate",
        labels: localizedText("速度", "Rate"),
        descriptions: localizedText("読み上げ速度です。", "The speaking rate."),
        placeholders: localizedText("例: fast または 80%", "Example: fast or 80%"),
        options: ["x-slow", "slow", "medium", "fast", "x-fast"],
      },
      {
        attribute: "pitch",
        labels: localizedText("高さ", "Pitch"),
        descriptions: localizedText("声の高さです。", "The pitch adjustment."),
        placeholders: localizedText("例: +2st", "Example: +2st"),
        options: ["-12st", "-8st", "-4st", "-2st", "0st", "+2st", "+4st", "+8st", "+12st"],
      },
      {
        attribute: "volume",
        labels: localizedText("音量", "Volume"),
        descriptions: localizedText("音量レベルです。", "The volume level."),
        placeholders: localizedText("例: loud", "Example: loud"),
        options: ["silent", "x-soft", "soft", "medium", "loud", "x-loud"],
      },
      {
        attribute: "contour",
        labels: localizedText("輪郭", "Contour"),
        descriptions: localizedText("発話中の声の高さの変化です。", "The pitch contour during the utterance."),
        placeholders: localizedText("例: (0%,+0st) (100%,+2st)", "Example: (0%,+0st) (100%,+2st)"),
      },
      {
        attribute: "range",
        labels: localizedText("範囲", "Range"),
        descriptions: localizedText("声の高さの範囲です。", "The pitch range."),
        placeholders: localizedText("例: +2st", "Example: +2st"),
      },
    ],
  },
  {
    id: "express-as",
    tagName: "mstts:express-as",
    mode: "wrap",
    minAttributes: 1,
    fields: [
      {
        attribute: "style",
        labels: localizedText("スタイル", "Style"),
        descriptions: localizedText("音声スタイルです。", "The speaking style."),
        placeholders: localizedText("例: cheerful", "Example: cheerful"),
        options: ["cheerful", "friendly", "calm", "sad", "angry", "excited", "serious"],
      },
      {
        attribute: "styledegree",
        labels: localizedText("スタイルの強度", "Style degree"),
        descriptions: localizedText("音声スタイルの強度です。", "The intensity of the speaking style."),
        placeholders: localizedText("例: 1.5", "Example: 1.5"),
        options: ["0.5", "1", "1.5", "2"],
      },
      {
        attribute: "role",
        labels: localizedText("役割", "Role"),
        descriptions: localizedText("対応する音声の役割です。", "The supported voice role."),
        placeholders: localizedText("例: YoungAdultFemale", "Example: YoungAdultFemale"),
      },
    ],
  },
];

export function createQuickInsertionTemplate(
  definition: QuickInsertionDefinition,
  values: QuickInsertionValues,
): QuickInsertionTemplate | null {
  const attributes = definition.fields
    .map(({ attribute }) => [attribute, values[attribute]?.trim() ?? ""] as const)
    .filter(([, value]) => value.length > 0);

  if (
    attributes.length < definition.minAttributes ||
    (definition.maxAttributes !== undefined && attributes.length > definition.maxAttributes)
  ) {
    return null;
  }

  const attributeText = attributes.map(([attribute, value]) => ` ${attribute}="${escapeXmlAttribute(value)}"`).join("");

  if (definition.mode === "insert") {
    return {
      prefix: `<${definition.tagName}${attributeText}/>`,
      suffix: "",
      mode: definition.mode,
    };
  }

  return {
    prefix: `<${definition.tagName}${attributeText}>`,
    suffix: `</${definition.tagName}>`,
    mode: definition.mode,
  };
}
