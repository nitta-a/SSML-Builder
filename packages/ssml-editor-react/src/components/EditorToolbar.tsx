import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { SelectionInfo, SsmlEditorEditMode, SsmlEditorInsertionDefinition } from "../SsmlEditor";
import { TOOLBAR_COPY, type EditorCopy, type SsmlEditorLocale } from "../locales";
import { editorStyles as styles } from "../styles/editorStyles";
import {
  ADVANCED_TOOLBAR_IDS,
  groupToolbarButtons,
  handleToolbarKeyDown,
  syncToolbarTabStops,
  type EditorHistoryState,
} from "../toolbar";

interface EditorToolbarProps {
  locale: SsmlEditorLocale;
  copy: EditorCopy;
  editMode: SsmlEditorEditMode;
  onEditModeChange: (mode: SsmlEditorEditMode) => void;
  readOnly: boolean;
  showIcons: boolean;
  showLabels: boolean;
  buttonIds: readonly string[];
  groupByButtonId: ReadonlyMap<string, string>;
  groupLabels: ReadonlyMap<string, string>;
  customizedLayout: boolean;
  insertions: readonly SsmlEditorInsertionDefinition[];
  openInsertionId: string | null;
  renderInsertion: (insertion: SsmlEditorInsertionDefinition, showLabels: boolean) => ReactNode;
  history: EditorHistoryState;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onFormat: () => void;
  onDismissPopover: () => void;
  decorationsVisible: boolean;
  onDecorationsChange: (visible: boolean) => void;
  helpOpen: boolean;
  helpPanelId: string;
  onHelpChange: (open: boolean) => void;
  selection: SelectionInfo;
  onPreview?: () => void;
  canPreview: boolean;
  className?: string;
  style?: CSSProperties;
}

export function EditorToolbar({
  locale,
  copy,
  editMode,
  onEditModeChange,
  readOnly,
  showIcons,
  showLabels,
  buttonIds,
  groupByButtonId,
  groupLabels,
  customizedLayout,
  insertions,
  openInsertionId,
  renderInsertion,
  history,
  onUndo,
  onRedo,
  onClear,
  onFormat,
  onDismissPopover,
  decorationsVisible,
  onDecorationsChange,
  helpOpen,
  helpPanelId,
  onHelpChange,
  selection,
  onPreview,
  canPreview,
  className,
  style,
}: EditorToolbarProps): ReactElement {
  const text = TOOLBAR_COPY[locale];
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLFieldSetElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusAdvancedRef = useRef(false);
  const panelId = useId();
  const confirmationId = useId();
  const insertionById = new Map(insertions.map((insertion) => [insertion.id, insertion]));
  const availableIds = buttonIds.filter((id) => editMode === "code" || id === "help" || id === "clearAll");
  const primaryIds = availableIds.filter((id) => customizedLayout || !ADVANCED_TOOLBAR_IDS.has(id));
  const advancedIds = availableIds.filter((id) => !customizedLayout && ADVANCED_TOOLBAR_IDS.has(id));
  const advancedPopoverOpen = openInsertionId !== null && advancedIds.includes(openInsertionId);
  const buttonStyle = showLabels ? styles.toolbarButton : { ...styles.toolbarButton, ...styles.toolbarIconOnly };

  useEffect(() => {
    if (toolbarRef.current) syncToolbarTabStops(toolbarRef.current);
  });

  useEffect(() => {
    setMoreOpen(false);
    setConfirmClear(false);
    if (readOnly || editMode === "visual") clearTriggerRef.current = null;
  }, [editMode, readOnly]);

  useEffect(() => {
    if (moreOpen && focusAdvancedRef.current) {
      focusAdvancedRef.current = false;
      advancedRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
  }, [moreOpen]);

  useEffect(() => {
    if (advancedPopoverOpen) setMoreOpen(true);
  }, [advancedPopoverOpen]);

  useEffect(() => {
    if (confirmClear) cancelRef.current?.focus();
  }, [confirmClear]);

  const cancelClear = (): void => {
    setConfirmClear(false);
    clearTriggerRef.current?.focus();
  };

  const renderControl = (id: string, advanced: boolean): ReactNode => {
    const labelsVisible = showLabels || advanced;
    const controlStyle = labelsVisible ? styles.toolbarButton : buttonStyle;
    const insertion = insertionById.get(id);
    if (insertion) return renderInsertion(insertion, labelsVisible);
    if (id === "decorations") {
      return (
        <button
          type="button"
          className="ssml-editor-toolbar-button ssml-editor-decorations-switch"
          style={controlStyle}
          data-ssml-editor-button="decorations"
          role="switch"
          aria-checked={decorationsVisible}
          aria-label={copy.decorations}
          title={decorationsVisible ? copy.decorationsHideTitle : copy.decorationsShowTitle}
          onClick={() => onDecorationsChange(!decorationsVisible)}
        >
          {labelsVisible && <span>{copy.decorations}</span>}
          <span className="ssml-editor-switch-track" style={styles.toolbarSwitchTrack} aria-hidden="true">
            <span className="ssml-editor-switch-thumb" style={styles.toolbarSwitchThumb} aria-hidden="true" />
          </span>
        </button>
      );
    }
    const actions = new Map([
      [
        "undo",
        {
          label: copy.undo,
          title: `${copy.undoTitle} (Ctrl / ⌘ Z)`,
          icon: "↩",
          apply: onUndo,
          disabled: !history.canUndo,
        },
      ],
      [
        "redo",
        {
          label: copy.redo,
          title: `${copy.redoTitle} (Ctrl / ⌘ Shift Z)`,
          icon: "↪",
          apply: onRedo,
          disabled: !history.canRedo,
        },
      ],
      ["format", { label: copy.format, title: copy.formatTitle, icon: "≡", apply: onFormat, disabled: !history.ready }],
      [
        "clearAll",
        {
          label: copy.clearAll,
          title: copy.clearAllTitle,
          icon: "×",
          apply: () => setConfirmClear(true),
          disabled: editMode === "code" && !history.ready,
        },
      ],
      [
        "help",
        { label: copy.help, title: copy.helpTitle, icon: "?", apply: () => onHelpChange(!helpOpen), disabled: false },
      ],
    ]);
    const action = actions.get(id);
    if (!action) return null;
    return (
      <button
        type="button"
        className="ssml-editor-toolbar-button"
        data-ssml-editor-button={id}
        data-compact-history={showIcons && (id === "undo" || id === "redo") ? "true" : undefined}
        data-danger={id === "clearAll" ? "true" : undefined}
        style={controlStyle}
        aria-label={action.label}
        title={action.title}
        disabled={id !== "help" && (readOnly || action.disabled)}
        aria-expanded={id === "help" ? helpOpen : undefined}
        aria-controls={id === "help" ? helpPanelId : undefined}
        onClick={(event) => {
          if (id === "clearAll") clearTriggerRef.current = event.currentTarget;
          action.apply();
        }}
      >
        {showIcons && (
          <span style={styles.toolbarIcon} aria-hidden="true">
            {action.icon}
          </span>
        )}
        {labelsVisible && <span className="ssml-editor-toolbar-action-label">{action.label}</span>}
      </button>
    );
  };

  const renderGroups = (ids: readonly string[], advanced = false): ReactNode =>
    groupToolbarButtons(ids, groupByButtonId, groupLabels).map((group) => (
      <fieldset
        key={`${group.id}-${group.buttonIds[0]}`}
        className="ssml-editor-toolbar-group"
        aria-label={group.label}
      >
        {group.label && (
          <legend className="ssml-editor-toolbar-group-label" aria-hidden="true">
            {group.label}
          </legend>
        )}
        <div className="ssml-editor-toolbar-group-controls">
          {group.buttonIds.map((id) => (
            <div key={id}>{renderControl(id, advanced)}</div>
          ))}
        </div>
      </fieldset>
    ));

  let hint: string = text.cursorHint;
  if (readOnly) hint = text.readOnlyHint;
  else if (editMode === "visual") hint = text.visualHint;
  else if (!history.ready) hint = text.loadingHint;
  else if (selection.hasSelection) hint = text.selectionHint;

  return (
    <div className={`ssml-editor-toolbar ${className ?? ""}`} style={style} data-ssml-editor-toolbar="">
      <div
        ref={toolbarRef}
        className="ssml-editor-toolbar-root"
        role="toolbar"
        aria-label={copy.toolbarAriaLabel}
        onFocus={(event) => {
          if (event.target instanceof HTMLButtonElement) syncToolbarTabStops(event.currentTarget, event.target);
        }}
        onKeyDown={(event) => handleToolbarKeyDown(event.nativeEvent, event.currentTarget)}
      >
        <div className="ssml-editor-toolbar-header">
          <fieldset className="ssml-editor-mode-switch" aria-label={text.editMode}>
            {(["visual", "code"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="ssml-editor-toolbar-button ssml-editor-mode-button"
                aria-pressed={editMode === mode}
                onClick={() => onEditModeChange(mode)}
              >
                {mode === "visual" ? text.visualMode : text.codeMode}
              </button>
            ))}
          </fieldset>
          <p className="ssml-editor-toolbar-context" role="status">
            {editMode === "code" && selection.hasSelection && (
              <span className="ssml-editor-toolbar-selection-count">
                {selection.characterCount}
                {copy.selectionCountSuffix}
              </span>
            )}
            {hint}
          </p>
          {editMode === "code" && onPreview && (
            <button
              type="button"
              className="ssml-editor-toolbar-button"
              aria-label={selection.hasSelection ? copy.previewSelection : text.previewCurrentLine}
              disabled={!canPreview}
              title={selection.hasSelection ? copy.previewSelectionTitle : text.previewCurrentLineTitle}
              onClick={onPreview}
            >
              {showIcons && <span aria-hidden="true">▶</span>}
              <span className="ssml-editor-toolbar-preview-label">
                {selection.hasSelection ? copy.previewSelection : text.previewCurrentLine}
              </span>
              <span className="ssml-editor-toolbar-preview-compact" aria-hidden="true">
                {text.previewCompact}
              </span>
            </button>
          )}
        </div>
        <div className="ssml-editor-toolbar-actions" data-ssml-editor-toolbar-actions="">
          {renderGroups(primaryIds)}
          {advancedIds.length > 0 && (
            <div className="ssml-editor-toolbar-group">
              <span className="ssml-editor-toolbar-group-label" aria-hidden="true">
                {text.settingsGroup}
              </span>
              <button
                type="button"
                className="ssml-editor-toolbar-button"
                title={text.moreTitle}
                aria-expanded={moreOpen}
                aria-controls={panelId}
                onClick={() => {
                  onDismissPopover();
                  focusAdvancedRef.current = !moreOpen;
                  setMoreOpen(!moreOpen);
                  if (moreOpen) setConfirmClear(false);
                }}
              >
                {text.more}
                <span aria-hidden="true">{moreOpen ? "▴" : "▾"}</span>
              </button>
            </div>
          )}
        </div>
        {moreOpen && advancedIds.length > 0 && (
          <fieldset
            ref={advancedRef}
            id={panelId}
            className="ssml-editor-toolbar-advanced"
            aria-label={text.moreHeading}
          >
            <p className="ssml-editor-toolbar-panel-heading">{text.moreHeading}</p>
            <div className="ssml-editor-toolbar-advanced-groups">{renderGroups(advancedIds, true)}</div>
          </fieldset>
        )}
      </div>
      {confirmClear && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`${confirmationId}-heading`}
          aria-describedby={`${confirmationId}-description`}
          className="ssml-editor-toolbar-confirmation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelClear();
            }
          }}
        >
          <p id={`${confirmationId}-heading`} className="ssml-editor-toolbar-panel-heading">
            {text.clearHeading}
          </p>
          <p id={`${confirmationId}-description`}>{text.clearDescription}</p>
          <div className="ssml-editor-toolbar-group-controls">
            <button ref={cancelRef} type="button" className="ssml-editor-toolbar-button" onClick={cancelClear}>
              {text.cancel}
            </button>
            <button
              type="button"
              className="ssml-editor-toolbar-button"
              data-danger="true"
              disabled={readOnly}
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
            >
              {copy.clearAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
