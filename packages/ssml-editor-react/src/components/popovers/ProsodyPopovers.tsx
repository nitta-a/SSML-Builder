import type { CSSProperties, ReactElement, Ref } from "react";
import type { SsmlEditorInsertionDefinition, SsmlEditorInsertionOption } from "../../SsmlEditor";
import { InsertionPopover } from "./InsertionPopover";

export interface ProsodyPopoversProps {
  insertions: readonly SsmlEditorInsertionDefinition[];
  language: "ja" | "en";
  isDarkTheme: boolean;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  toolbarButtonStyle: CSSProperties;
  isReadOnly: boolean;
  openPopoverId: string | null;
  menuPosition: { top: number; left: number } | null;
  menuRef: Ref<HTMLDivElement>;
  onToggle: (id: string, trigger: HTMLButtonElement) => void;
  onClose: () => void;
  onApply: (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption) => void;
}

export function ProsodyPopovers({
  insertions,
  openPopoverId,
  onToggle,
  ...props
}: ProsodyPopoversProps): ReactElement {
  return (
    <>
      {insertions.map((insertion) => (
        <InsertionPopover
          key={insertion.id}
          {...props}
          insertion={insertion}
          isOpen={openPopoverId === insertion.id}
          onToggle={(trigger) => onToggle(insertion.id, trigger)}
        />
      ))}
    </>
  );
}
