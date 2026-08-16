import type { ReactElement } from "react";
import { resolveExpressAsStyles } from "../../constants/ssmlPresets";
import { InsertionPopovers, type InsertionPopoversProps } from "./InsertionPopovers";

export interface ProsodyPopoversProps extends InsertionPopoversProps {
  voiceName?: string;
}

export function ProsodyPopovers({ insertions, voiceName, ...props }: ProsodyPopoversProps): ReactElement {
  const filteredInsertions = insertions.map((insertion) => {
    if (insertion.id !== "emotion" || insertion.tagName?.toLowerCase() !== "mstts:express-as") {
      return insertion;
    }

    const styles = new Set(
      resolveExpressAsStyles(
        voiceName,
        insertion.options.map((option) => option.value),
      ),
    );
    return {
      ...insertion,
      options: insertion.options.filter((option) => styles.has(option.value)),
    };
  });

  return <InsertionPopovers {...props} insertions={filteredInsertions} />;
}
