export type SsmlEditorInsertionButton =
  | "break"
  | "emphasis"
  | "rate"
  | "pitch"
  | "volume"
  | "emotion"
  | "say-as"
  | "phoneme";

export type SsmlEditorButton =
  | "help"
  | SsmlEditorInsertionButton
  | "undo"
  | "redo"
  | "clearAll"
  | "format";

export type SsmlEditorButtonVisibility = Readonly<
  Partial<Record<SsmlEditorButton, boolean>>
>;

export function isSsmlEditorButtonVisible(
  buttonVisibility: SsmlEditorButtonVisibility | undefined,
  button: SsmlEditorButton,
): boolean {
  return buttonVisibility?.[button] !== false;
}
