import type { ReactElement } from "react";
import {
  getExpressAsStyleCategory,
  resolveExpressAsStyles,
  type ExpressAsStyleCategory,
} from "../../constants/ssmlPresets";
import { EDITOR_COPY, type EditorCopy } from "../../locales";
import { InsertionPopovers, type InsertionPopoversProps } from "./InsertionPopovers";
import type { InsertionOptionGroup } from "./InsertionPopover";

export interface ProsodyPopoversProps extends InsertionPopoversProps {
  voiceName?: string;
}

const CATEGORY_LABEL_KEYS = {
  emotions: "categoryEmotions",
  scenarios: "categoryScenarios",
  media: "categoryMedia",
  other: "categoryOther",
} as const satisfies Record<ExpressAsStyleCategory, keyof EditorCopy>;

const CATEGORY_ORDER: readonly ExpressAsStyleCategory[] = ["emotions", "scenarios", "media", "other"];

function isExpressAsInsertion(insertion: ProsodyPopoversProps["insertions"][number]): boolean {
  return insertion.id === "emotion" && insertion.tagName?.toLowerCase() === "mstts:express-as";
}

function createOptionGroups(
  options: ProsodyPopoversProps["insertions"][number]["options"],
  language: ProsodyPopoversProps["language"],
): readonly InsertionOptionGroup[] {
  const t = (key: keyof EditorCopy): string => EDITOR_COPY[language][key];

  return CATEGORY_ORDER.map((category) => ({
    label: t(CATEGORY_LABEL_KEYS[category]),
    options: options.filter((option) => getExpressAsStyleCategory(option.value) === category),
  })).filter((group) => group.options.length > 0);
}

export function ProsodyPopovers({ insertions, voiceName, language, ...props }: ProsodyPopoversProps): ReactElement {
  const emptyOptionsMessages: Record<string, string> = {};
  const filteredInsertions = insertions.map((insertion) => {
    if (!isExpressAsInsertion(insertion)) {
      return insertion;
    }

    const availableStyles = new Set(
      resolveExpressAsStyles(
        voiceName,
        insertion.options.map((option) => option.value),
      ),
    );
    if (availableStyles.size === 0) {
      emptyOptionsMessages[insertion.id] = EDITOR_COPY[language].styleNotSupported;
    }
    const availableOptions = insertion.options.filter((option) => availableStyles.has(option.value));

    return {
      ...insertion,
      options: availableOptions,
    };
  });
  const optionGroups = Object.fromEntries(
    filteredInsertions
      .filter(isExpressAsInsertion)
      .map((insertion) => [insertion.id, createOptionGroups(insertion.options, language)]),
  );

  return (
    <InsertionPopovers
      {...props}
      emptyOptionsMessages={emptyOptionsMessages}
      language={language}
      insertions={filteredInsertions}
      optionGroups={optionGroups}
    />
  );
}
