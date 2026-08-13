import type { CSSProperties, ReactElement, Ref } from "react";
import { createPortal } from "react-dom";
import type { SsmlEditorInsertionDefinition, SsmlEditorInsertionOption } from "../../SsmlEditor";
import { editorStyles as styles } from "../../styles/editorStyles";

export interface InsertionPopoverProps {
  insertion: SsmlEditorInsertionDefinition;
  language: "ja" | "en";
  isDarkTheme: boolean;
  showToolbarIcons: boolean;
  showToolbarText: boolean;
  toolbarButtonStyle: CSSProperties;
  isReadOnly: boolean;
  isOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  menuRef: Ref<HTMLDivElement>;
  onToggle: (trigger: HTMLButtonElement) => void;
  onClose: () => void;
  onApply: (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption) => void;
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
  isReadOnly,
  isOpen,
  menuPosition,
  menuRef,
  onToggle,
  onClose,
  onApply,
}: InsertionPopoverProps): ReactElement {
  const menu =
    isOpen && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        data-ssml-editor=""
        data-theme={isDarkTheme ? "dark" : "light"}
        style={{ ...styles.toolbarMenu, top: menuPosition.top, left: menuPosition.left }}
        role="menu"
        aria-label={insertion.labels[language]}
      >
        {insertion.options.map((option) => (
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
        ))}
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
