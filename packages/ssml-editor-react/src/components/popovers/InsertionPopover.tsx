import type { CSSProperties, ReactElement, Ref } from "react";
import { createPortal } from "react-dom";
import type { SsmlEditorInsertionDefinition, SsmlEditorInsertionOption } from "../../SsmlEditor";
import { editorStyles as styles } from "../../styles/editorStyles";

export interface InsertionOptionGroup {
  label: string;
  options: readonly SsmlEditorInsertionOption[];
}

export interface InsertionPopoverProps {
  insertion: SsmlEditorInsertionDefinition;
  language: "ja" | "en";
  isDarkTheme: boolean;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  toolbarButtonStyle: CSSProperties;
  emptyOptionsMessage: string;
  isReadOnly: boolean;
  isOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  menuRef: Ref<HTMLDivElement>;
  onToggle: (trigger: HTMLButtonElement) => void;
  onClose: () => void;
  onApply: (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption) => void;
  optionGroups?: readonly InsertionOptionGroup[];
}

function getInsertionTitle(insertion: SsmlEditorInsertionDefinition, language: "ja" | "en"): string {
  if (insertion.titles) {
    return insertion.titles[language];
  }

  const tag = insertion.tagName ? ` <${insertion.tagName}${insertion.selfClosing ? "/>" : ">"}` : "";
  return `${insertion.labels[language]}${tag} — ${insertion.descriptions[language]}`;
}

export function InsertionPopover({
  insertion,
  language,
  isDarkTheme,
  showToolbarIcons,
  showToolbarText,
  toolbarButtonStyle,
  emptyOptionsMessage,
  isReadOnly,
  isOpen,
  menuPosition,
  menuRef,
  onToggle,
  onClose,
  onApply,
  optionGroups,
}: InsertionPopoverProps): ReactElement {
  const availableOptions = optionGroups?.flatMap((group) => group.options) ?? insertion.options;
  const renderOption = (option: SsmlEditorInsertionOption): ReactElement => (
    <button
      key={option.value}
      type="button"
      role="menuitem"
      style={styles.toolbarOption}
      title={option.descriptions?.[language] ?? insertion.descriptions[language]}
      disabled={isReadOnly}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!isReadOnly) {
          onApply(insertion, option);
        }
        onClose();
      }}
    >
      {option.labels[language]}
    </button>
  );
  const menu =
    isOpen && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        id={`ssml-editor-popover-${insertion.id}`}
        data-ssml-editor=""
        data-theme={isDarkTheme ? "dark" : "light"}
        style={{ ...styles.toolbarMenu, top: menuPosition.top, left: menuPosition.left }}
        role="menu"
        aria-label={insertion.labels[language]}
      >
        {availableOptions.length === 0 ? (
          <p role="status" style={styles.toolbarEmpty}>
            {emptyOptionsMessage}
          </p>
        ) : optionGroups ? (
          optionGroups.map((group) => (
            <fieldset key={group.label} style={styles.toolbarOptionGroup}>
              <legend style={styles.toolbarOptionGroupLabel}>{group.label}</legend>
              {group.options.map(renderOption)}
            </fieldset>
          ))
        ) : (
          insertion.options.map(renderOption)
        )}
      </div>
    ) : null;

  return (
    <>
      <div style={styles.toolbarDropdown}>
        <button
          type="button"
          style={toolbarButtonStyle}
          title={getInsertionTitle(insertion, language)}
          aria-label={insertion.labels[language]}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `ssml-editor-popover-${insertion.id}` : undefined}
          onClick={(event) => onToggle(event.currentTarget)}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              {insertion.icon}
            </span>
          )}
          {showToolbarText && <span>{insertion.labels[language]}</span>}
          <span style={styles.toolbarChevron} aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
