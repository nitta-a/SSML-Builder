import type { CSSProperties } from "react";
import { OVERLAY_Z_INDEX } from "../constants/ui";

export const TOOLBAR_CSS = `
[data-ssml-editor] {
  --ssml-editor-muted: #475569;
  --ssml-editor-danger: #b91c1c;
  --ssml-editor-danger-bg: #fef2f2;
}
[data-ssml-editor][data-theme="dark"] {
  --ssml-editor-muted: #cbd5e1;
  --ssml-editor-danger: #fca5a5;
  --ssml-editor-danger-bg: #450a0a;
}
section[data-ssml-editor] {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  container-type: inline-size;
  container-name: ssml-editor;
}
[data-ssml-editor] [data-ssml-editor-display] {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
[data-ssml-editor] [hidden] {
  display: none !important;
}
[data-ssml-editor] .ssml-editor-toolbar,
[data-ssml-editor] .ssml-editor-toolbar-root {
  display: grid;
  align-items: stretch;
  gap: 0.75rem;
  min-width: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ssml-editor-border);
}
[data-ssml-editor] .ssml-editor-mode-switch {
  display: inline-flex;
  gap: 0.1875rem;
  max-width: 100%;
  margin: 0;
  padding: 0.1875rem;
  border: 1px solid var(--ssml-editor-border);
  border-radius: 0.5rem;
  background: var(--ssml-editor-preview-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-context {
  flex: 1 1 14rem;
  min-width: 0;
  margin: 0;
  color: var(--ssml-editor-muted);
  font-size: 0.8125rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
[data-ssml-editor] .ssml-editor-toolbar-selection-count {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-active-bg);
  font-weight: 600;
}
[data-ssml-editor] .ssml-editor-toolbar-actions,
[data-ssml-editor] .ssml-editor-toolbar-advanced-groups {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem 1rem;
  min-width: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-group {
  display: grid;
  gap: 0.375rem;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-group-label {
  color: var(--ssml-editor-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.04em;
}
[data-ssml-editor] .ssml-editor-toolbar-group-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-group-controls > div,
[data-ssml-editor] .ssml-editor-toolbar-dropdown {
  min-width: 0;
  max-width: 100%;
}
[data-ssml-editor] .ssml-editor-toolbar-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 2.5rem;
  max-width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.375rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.4;
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-toolbar-button:not(:disabled):hover,
[data-ssml-editor] .ssml-editor-toolbar-option:not(:disabled):hover {
  background: var(--ssml-editor-active-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-button:disabled,
[data-ssml-editor] .ssml-editor-toolbar-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
[data-ssml-editor] .ssml-editor-toolbar-button:focus-visible,
[data-ssml-editor] .ssml-editor-toolbar-option:focus-visible,
[data-ssml-editor] .ssml-editor-toolbar-menu:focus-visible {
  outline: 2px solid var(--ssml-editor-active-border);
  outline-offset: 2px;
}
[data-ssml-editor] .ssml-editor-toolbar-button[data-active="true"],
[data-ssml-editor] .ssml-editor-mode-button[aria-pressed="true"] {
  border-color: var(--ssml-editor-active-border);
  background: var(--ssml-editor-active-bg);
}
[data-ssml-editor] .ssml-editor-mode-button {
  border-color: transparent;
  background: transparent;
}
[data-ssml-editor] .ssml-editor-mode-button[aria-pressed="true"] {
  font-weight: 600;
}
[data-ssml-editor] .ssml-editor-toolbar-advanced {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--ssml-editor-border);
  border-radius: 0.5rem;
  background: var(--ssml-editor-preview-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-panel-heading {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}
[data-ssml-editor] .ssml-editor-toolbar-confirmation {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--ssml-editor-danger);
  border-radius: 0.5rem;
  background: var(--ssml-editor-danger-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-confirmation p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
}
[data-ssml-editor] .ssml-editor-toolbar-button[data-danger="true"] {
  color: var(--ssml-editor-danger);
  border-color: var(--ssml-editor-danger);
}
[data-ssml-editor] .ssml-editor-decorations-switch[aria-checked="true"] .ssml-editor-switch-track {
  background: var(--ssml-editor-active-border);
}
[data-ssml-editor] .ssml-editor-decorations-switch[aria-checked="true"] .ssml-editor-switch-thumb {
  transform: translateX(1.25rem);
}
[data-ssml-editor].ssml-editor-toolbar-menu {
  box-sizing: border-box;
  min-width: min(18rem, calc(100vw - 1rem));
  max-width: min(24rem, calc(100vw - 1rem));
  max-height: min(28rem, calc(100dvh - 1rem));
  padding: 0.5rem;
  border-radius: 0.5rem;
}
[data-ssml-editor] .ssml-editor-toolbar-menu-heading {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.375rem;
  padding: 0.375rem 0.625rem 0.625rem;
  border-bottom: 1px solid var(--ssml-editor-border);
  color: var(--ssml-editor-color);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
[data-ssml-editor] .ssml-editor-toolbar-menu-heading p {
  margin: 0;
  color: var(--ssml-editor-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}
[data-ssml-editor] .ssml-editor-toolbar-option {
  display: grid;
  gap: 0.125rem;
  min-height: 2.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  white-space: normal;
  min-width: 0;
  overflow-wrap: anywhere;
}
[data-ssml-editor] .ssml-editor-toolbar-option-group {
  min-width: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-option-description {
  color: var(--ssml-editor-muted);
  font-size: 0.75rem;
  line-height: 1.5;
}
[data-ssml-editor] .ssml-editor-toolbar-preview-compact {
  display: none;
}
@container ssml-editor (max-width: 32rem) {
  [data-ssml-editor] .ssml-editor-toolbar-header {
    gap: 0.5rem;
  }
  [data-ssml-editor] .ssml-editor-toolbar-context {
    order: 2;
    flex-basis: 100%;
  }
  [data-ssml-editor] .ssml-editor-toolbar-preview-label {
    display: none;
  }
  [data-ssml-editor] .ssml-editor-toolbar-preview-compact {
    display: inline;
  }
  [data-ssml-editor] .ssml-editor-toolbar-group,
  [data-ssml-editor] .ssml-editor-toolbar-group-controls {
    display: contents;
  }
  [data-ssml-editor] .ssml-editor-toolbar-group-label {
    display: none;
  }
  [data-ssml-editor] .ssml-editor-toolbar-button[data-compact-history="true"] .ssml-editor-toolbar-action-label {
    display: none;
  }
  [data-ssml-editor] .ssml-editor-toolbar-actions,
  [data-ssml-editor] .ssml-editor-toolbar-advanced-groups {
    gap: 0.375rem;
  }
}
@media (pointer: coarse) {
  [data-ssml-editor] .ssml-editor-toolbar-button,
  [data-ssml-editor] .ssml-editor-toolbar-option {
    min-height: 2.75rem !important;
  }
}
`.trim();

export const editorStyles: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    gap: "0.75rem",
    padding: "1rem",
    border: "1px solid var(--ssml-editor-border)",
    borderRadius: "0.5rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
  },
  toolbarContainer: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarSeparator: {
    width: "1px",
    height: "2.25rem",
    margin: "0 0.25rem",
    backgroundColor: "var(--ssml-editor-border)",
  },
  toolbarDropdown: {
    position: "relative",
    display: "inline-block",
  },
  toolbarSwitch: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    minHeight: "2.25rem",
    color: "var(--ssml-editor-color)",
    font: "inherit",
  },
  toolbarSwitchTrack: {
    display: "inline-flex",
    alignItems: "center",
    width: "2.75rem",
    height: "1.5rem",
    padding: "0.1875rem",
    border: 0,
    borderRadius: "999px",
    backgroundColor: "var(--ssml-editor-control-border)",
    cursor: "pointer",
    font: "inherit",
    transition: "background-color 0.2s ease",
  },
  toolbarSwitchThumb: {
    width: "1.125rem",
    height: "1.125rem",
    borderRadius: "50%",
    backgroundColor: "var(--ssml-editor-bg)",
    transition: "transform 0.2s ease",
  },
  toolbarButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    minHeight: "2.5rem",
    padding: "0.5rem 0.625rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.375rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    font: "inherit",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  toolbarButtonActive: {
    border: "1px solid var(--ssml-editor-active-border)",
    backgroundColor: "var(--ssml-editor-active-bg)",
  },
  display: {
    display: "grid",
    minWidth: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "0.5rem",
  },
  visual: {
    display: "grid",
    gap: "0.75rem",
    minHeight: "8rem",
    padding: "0.75rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
  },
  toolbarIconOnly: {
    justifyContent: "center",
    minWidth: "2.25rem",
    padding: "0.375rem",
  },
  toolbarIcon: {
    display: "inline-flex",
    width: "1.25rem",
    justifyContent: "center",
    fontSize: "1.1rem",
    lineHeight: 1,
  },
  toolbarChevron: {
    fontSize: "0.7rem",
    lineHeight: 1,
  },
  toolbarMenu: {
    position: "fixed",
    zIndex: OVERLAY_Z_INDEX,
    display: "grid",
    boxSizing: "border-box",
    minWidth: "min(18rem, calc(100vw - 1rem))",
    maxWidth: "min(24rem, calc(100vw - 1rem))",
    maxHeight: "min(28rem, calc(100dvh - 1rem))",
    gap: "0.125rem",
    padding: "0.5rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.5rem",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.25rem 0.75rem rgb(0 0 0 / 20%)",
    overflowY: "auto",
  },
  toolbarOption: {
    display: "grid",
    gap: "0.125rem",
    minHeight: "2.5rem",
    padding: "0.5rem 0.625rem",
    border: 0,
    borderRadius: "0.375rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "transparent",
    font: "inherit",
    textAlign: "left",
    whiteSpace: "normal",
    cursor: "pointer",
  },
  toolbarOptionGroup: {
    display: "grid",
    gap: "0.125rem",
    margin: 0,
    padding: 0,
    border: 0,
  },
  toolbarOptionGroupLabel: {
    padding: "0.375rem 0.5rem 0.125rem",
    color: "var(--ssml-editor-color)",
    fontSize: "0.875rem",
    fontWeight: 600,
    whiteSpace: "normal",
  },
  toolbarEmpty: {
    margin: 0,
    padding: "0.375rem 0.5rem",
    color: "var(--ssml-editor-color)",
    whiteSpace: "normal",
  },
  toolbarEmptySelect: {
    padding: "0.375rem 0.5rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.125rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    font: "inherit",
    textAlign: "left",
  },
  helpPanel: {
    display: "grid",
    gap: "0.5rem",
    width: "100%",
    padding: "0.75rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-preview-bg)",
  },
  helpHeading: {
    margin: 0,
    fontSize: "1rem",
  },
  helpDescription: {
    margin: 0,
    lineHeight: 1.5,
  },
  helpList: {
    display: "grid",
    gap: "0.375rem",
    margin: 0,
    paddingLeft: "1.25rem",
  },
  helpItem: {
    listStyleType: "none",
    lineHeight: 1.45,
  },
  helpIcon: {
    display: "inline-flex",
    width: "1.25rem",
    justifyContent: "center",
    fontSize: "1.1rem",
    lineHeight: 1.45,
  },
  helpSettingsAccordion: {
    marginTop: "0.375rem",
    overflow: "hidden",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    backgroundColor: "var(--ssml-editor-control-bg)",
  },
  helpSettingsSummary: {
    display: "grid",
    gridTemplateColumns: "1rem 1.25rem minmax(0, 1fr)",
    columnGap: "0.5rem",
    alignItems: "start",
    padding: "0.5rem 0.625rem",
    cursor: "pointer",
  },
  helpSettingsSummaryContent: {
    minWidth: 0,
  },
  helpSettingsDescription: {
    margin: "0.5rem 0.75rem 0",
    fontSize: "0.875rem",
  },
  helpSettingsList: {
    display: "grid",
    gap: "0.125rem",
    margin: "0.25rem 0.75rem 0.75rem",
    paddingLeft: "1.25rem",
    fontSize: "0.875rem",
  },
  editor: {
    boxSizing: "border-box",
    position: "relative",
    minWidth: 0,
    width: "100%",
    minHeight: "8rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    overflow: "visible",
  },
  selectionActions: {
    position: "absolute",
    zIndex: OVERLAY_Z_INDEX,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.25rem",
    maxWidth: "calc(100% - 1rem)",
    padding: "0.25rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.375rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-control-bg)",
    boxShadow: "0 0.25rem 0.75rem rgb(0 0 0 / 20%)",
  },
  selectionCount: {
    padding: "0.25rem 0.375rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  selectionActionsDivider: {
    width: "1px",
    height: "1.5rem",
    backgroundColor: "var(--ssml-editor-border)",
  },
  selectionActionButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    minHeight: "1.75rem",
    padding: "0.25rem 0.375rem",
    border: "1px solid var(--ssml-editor-control-border)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-color)",
    backgroundColor: "var(--ssml-editor-bg)",
    font: "inherit",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  selectionActionIcon: {
    display: "inline-flex",
    width: "1rem",
    justifyContent: "center",
    lineHeight: 1,
  },
  error: {
    margin: 0,
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--ssml-editor-error)",
    borderRadius: "0.25rem",
    color: "var(--ssml-editor-error)",
    backgroundColor: "var(--ssml-editor-error-bg)",
    lineHeight: 1.5,
  },
};
