/**
 * ssml-editor-react: React-based SSML editor component.
 */

export { SsmlEditor } from "./SsmlEditor";
export type {
  SsmlEditorButton,
  SsmlEditorButtonVisibility,
  SsmlEditorInsertionButton,
} from "./buttonVisibility";
export type {
  SsmlEditorLineNumbers,
  SsmlEditorCustomInsertion,
  SsmlEditorCustomInsertionCollection,
  SsmlEditorCustomInsertionDefinition,
  SsmlEditorInsertionDefinition,
  SsmlEditorInsertionGroup,
  SsmlEditorInsertionMode,
  SsmlEditorInsertionOption,
  SsmlEditorInsertionTemplate,
  SsmlEditorOptions,
  SsmlEditorRef,
  SsmlEditorProps,
  SsmlEditorToolbarGroup,
  SelectionInfo,
  SsmlEditorTheme,
  SsmlEditorWordWrap,
  SsmlInsertionDefinition,
  SsmlInsertionOption,
  SsmlInsertionTemplate,
} from "./SsmlEditor";
export { EDITOR_COPY, INLINE_BADGE_COPY, SSML_HOVER_COPY } from "./locales";
export type {
  EditorCopy,
  InlineBadgeCopy,
  MacroPresetCopy,
  SsmlEditorLanguage,
  SsmlEditorLocale,
  SsmlEditorLocalizedText,
  SsmlHoverLocale,
  SsmlHoverParameterCopy,
  SsmlHoverTagCopy,
} from "./locales";
export { MACRO_PRESETS } from "./constants/ssmlPresets";
export type { MacroPresetKey } from "./constants/ssmlPresets";
export {
  createSsmlEditorInsertionDefinition,
  SSML_INSERTIONS,
} from "./SsmlEditor";
export { registerSsmlCodeLens } from "./ssmlCodeLens";
export type { SsmlCodeLensAction, SsmlCodeLensCallback } from "./ssmlCodeLens";
export { updateTagAttribute } from "./ssmlContext";
export type { SsmlTagRange } from "./ssmlContext";
export { applyMacroPreset } from "./ssmlInsertion";
