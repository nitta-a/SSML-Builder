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
  SsmlEditorLanguage,
  SsmlEditorLineNumbers,
  SsmlEditorCustomInsertion,
  SsmlEditorCustomInsertionCollection,
  SsmlEditorCustomInsertionDefinition,
  SsmlEditorInsertionDefinition,
  SsmlEditorInsertionGroup,
  SsmlEditorInsertionMode,
  SsmlEditorInsertionOption,
  SsmlEditorInsertionTemplate,
  SsmlEditorLocalizedText,
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
export { EDITOR_COPY, SSML_HOVER_COPY } from "./locales";
export type {
  EditorCopy,
  SsmlEditorLocale,
  SsmlHoverLocale,
  SsmlHoverParameterCopy,
  SsmlHoverTagCopy,
} from "./locales";
export {
  createSsmlEditorInsertionDefinition,
  SSML_INSERTIONS,
} from "./SsmlEditor";
