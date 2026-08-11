export type QuickInsertionId = "break" | "emphasis" | "prosody" | "express-as";
export type QuickInsertionMode = "insert" | "wrap";
export type QuickInsertionLocalizedText = Readonly<Record<"ja" | "en", string>>;

export interface QuickInsertionField {
  attribute: string;
  labels: QuickInsertionLocalizedText;
  options: readonly string[];
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
        options: ["500ms", "1s", "2s", "3s"],
      },
      {
        attribute: "strength",
        labels: localizedText("強さ", "Strength"),
        options: ["none", "x-weak", "weak", "medium", "strong", "x-strong"],
      },
    ],
  },
  {
    id: "emphasis",
    tagName: "emphasis",
    mode: "wrap",
    minAttributes: 1,
    maxAttributes: 1,
    fields: [
      {
        attribute: "level",
        labels: localizedText("強調レベル", "Emphasis level"),
        options: ["strong", "moderate", "reduced", "none"],
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
        options: ["x-slow", "slow", "medium", "fast", "x-fast"],
      },
      {
        attribute: "pitch",
        labels: localizedText("高さ", "Pitch"),
        options: ["-12st", "-8st", "-4st", "-2st", "0st", "+2st", "+4st", "+8st", "+12st"],
      },
      {
        attribute: "volume",
        labels: localizedText("音量", "Volume"),
        options: ["silent", "x-soft", "soft", "medium", "loud", "x-loud"],
      },
      {
        attribute: "contour",
        labels: localizedText("輪郭", "Contour"),
        options: ["(0%,+0st) (100%,+0st)", "(0%,+0st) (100%,+2st)", "(0%,+2st) (100%,+0st)", "(0%,-2st) (100%,+2st)"],
      },
      {
        attribute: "range",
        labels: localizedText("範囲", "Range"),
        options: ["x-low", "low", "medium", "high", "x-high", "-4st", "0st", "+4st"],
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
        options: ["cheerful", "friendly", "calm", "sad", "angry", "excited", "serious"],
      },
      {
        attribute: "styledegree",
        labels: localizedText("スタイルの強度", "Style degree"),
        options: ["0.5", "1", "1.5", "2"],
      },
      {
        attribute: "role",
        labels: localizedText("役割", "Role"),
        options: ["Girl", "Boy", "YoungAdultFemale", "YoungAdultMale", "OlderAdultFemale", "OlderAdultMale"],
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
