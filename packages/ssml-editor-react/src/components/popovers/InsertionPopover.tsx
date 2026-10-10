import { useEffect, useId, useRef } from "react";
import type { CSSProperties, ReactElement, Ref } from "react";
import { createPortal } from "react-dom";
import type { SsmlEditorInsertionDefinition, SsmlEditorInsertionOption } from "../../SsmlEditor";
import { editorStyles as styles } from "../../styles/editorStyles";
import { focusMenuItem, handleMenuKeyDown } from "../../toolbar";

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
  disabled?: boolean;
  disabledReason?: string;
  isOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  menuRef: Ref<HTMLDivElement>;
  onToggle: (trigger: HTMLButtonElement) => void;
  onClose: (restoreFocus?: boolean) => void;
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
  disabled = false,
  disabledReason,
  isOpen,
  menuPosition,
  menuRef,
  onToggle,
  onClose,
  onApply,
  optionGroups,
}: InsertionPopoverProps): ReactElement {
  const menuId = useId();
  const openingEdge = useRef<"first" | "last">("first");
  const positioned = menuPosition !== null;
  useEffect(() => {
    const menu = document.getElementById(menuId);
    if (isOpen && positioned && menu) focusMenuItem(menu, openingEdge.current);
  }, [isOpen, menuId, positioned]);

  const hasOptions = optionGroups
    ? optionGroups.some((group) => group.options.length > 0)
    : insertion.options.length > 0;
  const renderOption = (option: SsmlEditorInsertionOption): ReactElement => (
    <button
      key={option.value}
      type="button"
      role="menuitem"
      aria-label={option.labels[language]}
      aria-description={option.descriptions?.[language]}
      className="ssml-editor-toolbar-option"
      style={styles.toolbarOption}
      title={option.descriptions?.[language] ?? insertion.descriptions[language]}
      disabled={isReadOnly || disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!isReadOnly && !disabled) {
          onApply(insertion, option);
        }
        onClose();
      }}
    >
      <span>{option.labels[language]}</span>
      {option.descriptions && (
        <span className="ssml-editor-toolbar-option-description" aria-hidden="true">
          {option.descriptions[language]}
        </span>
      )}
    </button>
  );
  const menu =
    isOpen && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        id={menuId}
        className="ssml-editor-toolbar-menu"
        data-ssml-editor=""
        data-theme={isDarkTheme ? "dark" : "light"}
        style={{ ...styles.toolbarMenu, top: menuPosition.top, left: menuPosition.left }}
        role="menu"
        tabIndex={-1}
        aria-label={insertion.labels[language]}
        onKeyDown={(event) => handleMenuKeyDown(event.nativeEvent, event.currentTarget, onClose)}
      >
        <div className="ssml-editor-toolbar-menu-heading" role="presentation">
          <strong>{insertion.labels[language]}</strong>
          <p>{insertion.parameterDescription[language]}</p>
        </div>
        {!hasOptions ? (
          <p role="note" style={styles.toolbarEmpty}>
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
          className="ssml-editor-toolbar-button"
          data-ssml-editor-button={insertion.id}
          style={toolbarButtonStyle}
          title={disabledReason ?? getInsertionTitle(insertion, language)}
          aria-label={insertion.labels[language]}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          disabled={isReadOnly || disabled}
          onClick={(event) => {
            openingEdge.current = "first";
            onToggle(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            event.stopPropagation();
            const edge = event.key === "ArrowUp" ? "last" : "first";
            openingEdge.current = edge;
            const menu = document.getElementById(menuId);
            if (isOpen && menu) focusMenuItem(menu, edge);
            else onToggle(event.currentTarget);
          }}
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
