export type SsmlEditorInsertionButton =
  | "break"
  | "emphasis"
  | "rate"
  | "pitch"
  | "volume"
  | "emotion"
  | "say-as"
  | "phoneme"
  | "audio"
  | "sub"
  | "lang"
  | "mark"
  | "bookmark"
  | "mstts:silence"
  | "mstts:viseme"
  | (string & {});

export type SsmlEditorButton =
  | "help"
  | SsmlEditorInsertionButton
  | "undo"
  | "redo"
  | "clearAll"
  | "format"
  | (string & {});

export type SsmlEditorButtonVisibility = Readonly<Partial<Record<string, boolean>>>;

export function isSsmlEditorButtonVisible(
  buttonVisibility: SsmlEditorButtonVisibility | undefined,
  button: SsmlEditorButton | string,
): boolean {
  return buttonVisibility?.[button] !== false;
}
