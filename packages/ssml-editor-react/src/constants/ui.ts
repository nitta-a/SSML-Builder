import type { SsmlEditorLocale } from "../locales.ts";

export const DEFAULT_LOCALE: SsmlEditorLocale = "ja";
export const OVERLAY_Z_INDEX = 9999;
export const SELECTION_OVERLAY_ABOVE_THRESHOLD_LINES = 4;

export const SSML_INSERTION_MODES = {
  insert: "insert",
  wrap: "wrap",
} as const;
