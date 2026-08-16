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

export function ProsodyPopovers({ insertions, voiceName, language, ...props }: ProsodyPopoversProps): ReactElement {
  const t = (key: keyof EditorCopy): string => EDITOR_COPY[language][key];
  let optionGroups: readonly InsertionOptionGroup[] | undefined;
  const filteredInsertions = insertions.map((insertion) => {
    if (insertion.id !== "emotion" || insertion.tagName?.toLowerCase() !== "mstts:express-as") {
      return insertion;
    }

    const availableStyles = new Set(
      resolveExpressAsStyles(
        voiceName,
        insertion.options.map((option) => option.value),
      ),
    );
    const availableOptions = insertion.options.filter((option) => availableStyles.has(option.value));
    optionGroups = CATEGORY_ORDER.map((category) => ({
      label: t(CATEGORY_LABEL_KEYS[category]),
      options: availableOptions.filter((option) => getExpressAsStyleCategory(option.value) === category),
    })).filter((group) => group.options.length > 0);

    return {
      ...insertion,
      options: availableOptions,
    };
  });

  return (
    <InsertionPopovers
      {...props}
      language={language}
      insertions={filteredInsertions}
      optionGroups={{ emotion: optionGroups ?? [] }}
    />
  );
}
