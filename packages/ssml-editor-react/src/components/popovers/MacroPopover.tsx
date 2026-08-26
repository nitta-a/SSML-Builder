import type { CSSProperties, ReactElement, Ref } from "react";
import { createPortal } from "react-dom";
import { MACRO_PRESETS, type MacroPresetKey } from "../../constants/ssmlPresets";
import type { MacroPresetCopy } from "../../locales";
import { editorStyles as styles } from "../../styles/editorStyles";

export interface MacroPopoverProps {
  labels: MacroPresetCopy;
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
  onApply: (presetKey: MacroPresetKey) => void;
  presetsLabel: string;
  presetsTitle: string;
}

const PRESET_KEYS = Object.keys(MACRO_PRESETS) as MacroPresetKey[];

export function MacroPopover({
  labels,
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
  presetsLabel,
  presetsTitle,
}: MacroPopoverProps): ReactElement {
  const menu =
    isOpen && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        id="ssml-editor-popover-presets"
        data-ssml-editor=""
        data-theme={isDarkTheme ? "dark" : "light"}
        style={{ ...styles.toolbarMenu, top: menuPosition.top, left: menuPosition.left }}
        role="menu"
        aria-label={presetsLabel}
      >
        {PRESET_KEYS.map((presetKey) => (
          <button
            key={presetKey}
            type="button"
            role="menuitem"
            style={styles.toolbarOption}
            title={labels[presetKey]}
            disabled={isReadOnly}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onApply(presetKey);
              onClose();
            }}
          >
            {labels[presetKey]}
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
          title={presetsTitle}
          aria-label={presetsLabel}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? "ssml-editor-popover-presets" : undefined}
          onClick={(event) => onToggle(event.currentTarget)}
        >
          {showToolbarIcons && (
            <span style={styles.toolbarIcon} aria-hidden="true">
              ✨
            </span>
          )}
          {showToolbarText && <span>{presetsLabel}</span>}
          <span style={styles.toolbarChevron} aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
