/**
 * ssml-editor-react: React-based SSML editor component.
 */

export { SsmlEditor } from "./SsmlEditor";
export { VisualSsmlEditor } from "./components/VisualSsmlEditor";
export type { VisualSsmlEditorProps } from "./components/VisualSsmlEditor";
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
  SsmlEditorEditMode,
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
  SsmlEditorLanguage,
  SsmlEditorLocale,
  SsmlEditorLocalizedText,
  SsmlHoverLocale,
  SsmlHoverParameterCopy,
  SsmlHoverTagCopy,
} from "./locales";
export {
  createSsmlEditorInsertionDefinition,
  SSML_INSERTIONS,
} from "./SsmlEditor";
export { registerSsmlCodeLens } from "./ssmlCodeLens";
export type { SsmlCodeLensAction, SsmlCodeLensCallback } from "./ssmlCodeLens";
export { updateTagAttribute } from "./ssmlContext";
export type { SsmlTagRange } from "./ssmlContext";
