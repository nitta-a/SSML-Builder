import type { CSSProperties, ReactElement, Ref } from "react";
import type { SsmlEditorInsertionDefinition, SsmlEditorInsertionOption } from "../../SsmlEditor";
import { InsertionPopover, type InsertionOptionGroup } from "./InsertionPopover";

export interface InsertionPopoversProps {
  insertions: readonly SsmlEditorInsertionDefinition[];
  language: "ja" | "en";
  isDarkTheme: boolean;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  toolbarButtonStyle: CSSProperties;
  emptyOptionsMessage: string;
  isReadOnly: boolean;
  openPopoverId: string | null;
  menuPosition: { top: number; left: number } | null;
  menuRef: Ref<HTMLDivElement>;
  onToggle: (id: string, trigger: HTMLButtonElement) => void;
  onClose: () => void;
  onApply: (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption) => void;
  emptyOptionsMessages?: Readonly<Record<string, string>>;
  optionGroups?: Readonly<Record<string, readonly InsertionOptionGroup[]>>;
}

export function InsertionPopovers({
  insertions,
  openPopoverId,
  onToggle,
  emptyOptionsMessages,
  optionGroups,
  ...props
}: InsertionPopoversProps): ReactElement {
  return (
    <>
      {insertions.map((insertion) => (
        <InsertionPopover
          key={insertion.id}
          {...props}
          insertion={insertion}
          emptyOptionsMessage={emptyOptionsMessages?.[insertion.id] ?? props.emptyOptionsMessage}
          optionGroups={optionGroups?.[insertion.id]}
          isOpen={openPopoverId === insertion.id}
          onToggle={(trigger) => onToggle(insertion.id, trigger)}
        />
      ))}
    </>
  );
}
