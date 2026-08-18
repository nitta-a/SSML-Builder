import { useCallback, useEffect, useId, useRef, useState } from "react";
import { buildPartialSsml, buildSsml } from "@ssml-builder-js/ssml-core";
import type {
  ProsodyElement,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  SsmlPartialContext,
  VoiceElement,
} from "@ssml-builder-js/ssml-core";
import type {
  SsmlEditorInsertionDefinition,
  SsmlEditorInsertionOption,
  SsmlEditorInsertionTemplate,
  SsmlEditorTheme,
  SelectionInfo,
} from "../SsmlEditor";
import { clearSsmlDocument } from "../clearSsmlDocument";
import { formatXmlFragment } from "../formatXml";
import { getEditableRegion, getEditableText, updateEditableText } from "../editableSsml";
import { createSsmlInsertionEdit } from "../ssmlInsertion";
import { findSsmlVoiceContext } from "../ssmlContext";
import type { MonacoEditor, SsmlSyntaxError } from "../ssmlDiagnostics";
import { SELECTION_OVERLAY_ABOVE_THRESHOLD_LINES } from "../constants/ui";

const TIMING_INSERTION_TAGS = new Set(["break", "mstts:silence"]);
const PROSODY_INSERTION_TAGS = new Set(["prosody", "mstts:express-as", "voice", "emphasis"]);
const TEXT_INSERTION_TAGS = new Set(["sub", "say-as", "phoneme", "w", "lang"]);

export interface SelectionOverlayState extends SelectionInfo {
  position: {
    top: number;
    left: number;
    height: number;
  } | null;
  placement: "above" | "below";
}

export interface MonacoEditorRef {
  current: MonacoEditor | null;
}

export interface UseSsmlEditorStateOptions {
  document: SsmlDocument;
  resolvedTheme: SsmlEditorTheme;
  showDecorations: boolean;
  onChange?: (document: SsmlDocument) => void;
  onSsmlChange?: (xml: string) => void;
  onSelectionChange?: (info: SelectionInfo) => void;
  onPreviewSelection?: (ssml: string) => void;
  injectTheme?: () => void;
}

const EMPTY_SELECTION_OVERLAY: SelectionOverlayState = {
  selectedText: "",
  characterCount: 0,
  hasSelection: false,
  position: null,
  placement: "above",
};

function isSsmlElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function isVoice(element: SsmlElement): element is VoiceElement {
  return element.type === "voice";
}

function isProsody(element: SsmlElement): element is ProsodyElement {
  return element.type === "prosody";
}

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function getPartialContext(document: SsmlDocument): SsmlPartialContext {
  const children = getDocumentChildren(document);
  const voice = findFirstElement(children, isVoice);
  const prosody = findFirstElement(children, isProsody);
  const context: SsmlPartialContext = {
    version: document.version,
    lang: document.lang,
  };

  if (voice) {
    context.voice = {
      name: voice.name,
      effect: voice.effect,
      attributes: voice.attributes,
    };
  }

  if (prosody) {
    context.prosody = {
      rate: prosody.rate,
      pitch: prosody.pitch,
      volume: prosody.volume,
      contour: prosody.contour,
      range: prosody.range,
      attributes: prosody.attributes,
    };
  }

  return context;
}

function findFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
): T | undefined {
  for (const node of nodes) {
    if (!isSsmlElement(node)) {
      continue;
    }

    if (predicate(node)) {
      return node;
    }

    const child = findFirstElement(node.children ?? [], predicate);
    if (child) {
      return child;
    }
  }

  return undefined;
}

function getSelectionInfo(editor: MonacoEditor): SelectionInfo {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return {
      selectedText: "",
      characterCount: 0,
      hasSelection: false,
    };
  }

  const selectedText = model.getValueInRange(selection);
  return {
    selectedText,
    characterCount: selectedText.length,
    hasSelection: selectedText.length > 0,
  };
}

function getSelectionOverlayState(editor: MonacoEditor): SelectionOverlayState {
  const info = getSelectionInfo(editor);
  if (!info.hasSelection) {
    return { ...info, position: null, placement: "above" };
  }

  const selection = editor.getSelection();
  if (!selection) {
    return { ...info, position: null, placement: "above" };
  }

  const position = editor.getScrolledVisiblePosition(selection.getStartPosition());
  if (!position) {
    return { ...info, position: null, placement: "above" };
  }

  const editorHeight = editor.getLayoutInfo().height;
  if (position.top + position.height < 0 || position.top > editorHeight) {
    return { ...info, position: null, placement: "above" };
  }

  return {
    ...info,
    position,
    placement: position.top >= SELECTION_OVERLAY_ABOVE_THRESHOLD_LINES * position.height ? "above" : "below",
  };
}

function getCurrentLineText(editor: MonacoEditor): string | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return null;
  }

  const text = model.getLineContent(selection.positionLineNumber);
  return text.trim().length > 0 ? text : null;
}

function getSelectedText(editor: MonacoEditor): string | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return null;
  }

  const selectedText = model.getValueInRange(selection);
  return selectedText.length > 0 ? selectedText : getCurrentLineText(editor);
}

function getEffectiveVoiceName(editor: MonacoEditor, document: SsmlDocument): string | undefined {
  const model = editor.getModel();
  const selection = editor.getSelection();
  const outerVoiceName = getEditableRegion(document).voiceName;
  if (!model || !selection) {
    return outerVoiceName;
  }

  const offset = model.getOffsetAt(selection.getStartPosition());
  const voiceContext = findSsmlVoiceContext(model.getValue(), offset);
  return voiceContext === undefined ? outerVoiceName : voiceContext.voiceName;
}

function getSelectedSsml(editor: MonacoEditor, document: SsmlDocument): string | null {
  const selectedText = getSelectedText(editor);
  return selectedText === null ? null : buildPartialSsml(selectedText, getPartialContext(document));
}

function getCurrentLineSsml(editor: MonacoEditor, document: SsmlDocument): string | null {
  const currentLineText = getCurrentLineText(editor);
  return currentLineText === null ? null : buildPartialSsml(currentLineText, getPartialContext(document));
}

function applySsmlTemplate(editor: MonacoEditor, template: SsmlEditorInsertionTemplate): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return;
  }

  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const selectedText = selection.isEmpty() ? "" : model.getValueInRange(selection);
  const { replacement, selectionOffset } = createSsmlInsertionEdit(
    model.getValue(),
    startOffset,
    endOffset,
    template,
    model.getEOL(),
    selectedText,
  );

  editor.pushUndoStop();
  const applied = editor.executeEdits("ssml-toolbar", [
    {
      range: selection,
      text: replacement,
    },
  ]);
  editor.pushUndoStop();
  if (!applied) {
    return;
  }

  const nextSelectionStart = model.getPositionAt(startOffset + selectionOffset);
  const nextSelectionEnd = model.getPositionAt(endOffset + selectionOffset);
  editor.setSelection({
    selectionStartLineNumber: nextSelectionStart.lineNumber,
    selectionStartColumn: nextSelectionStart.column,
    positionLineNumber: nextSelectionEnd.lineNumber,
    positionColumn: nextSelectionEnd.column,
  });
  editor.focus();
}

function applySsmlInsertion(
  editor: MonacoEditor,
  insertion: SsmlEditorInsertionDefinition,
  option: SsmlEditorInsertionOption,
): void {
  applySsmlTemplate(editor, insertion.createTemplate(option.value));
}

export function useSsmlEditorState({
  document,
  resolvedTheme,
  showDecorations,
  onChange,
  onSsmlChange,
  onSelectionChange,
  onPreviewSelection,
  injectTheme,
}: UseSsmlEditorStateOptions) {
  const editorRef = useRef<MonacoEditor | null>(null);
  const [draftDocument, setDraftDocument] = useState(document);
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayState>(EMPTY_SELECTION_OVERLAY);
  const [isDark, setIsDark] = useState(false);
  const [decorationsVisible, setDecorationsVisible] = useState(showDecorations);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [syntaxError, setSyntaxError] = useState<SsmlSyntaxError | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [popoverVoiceName, setPopoverVoiceName] = useState<string | undefined>(undefined);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const helpPanelId = useId();
  const draftDocumentRef = useRef(document);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onPreviewSelectionRef = useRef(onPreviewSelection);
  const activePopoverTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activePopoverMenuRef = useRef<HTMLDivElement | null>(null);

  draftDocumentRef.current = draftDocument;
  onSelectionChangeRef.current = onSelectionChange;
  onPreviewSelectionRef.current = onPreviewSelection;

  useEffect(() => {
    injectTheme?.();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (event: MediaQueryListEvent): void => setIsDark(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [injectTheme]);

  useEffect(() => {
    draftDocumentRef.current = document;
    setDraftDocument(document);
  }, [document]);

  useEffect(() => {
    setDecorationsVisible(showDecorations);
  }, [showDecorations]);

  const closePopover = useCallback((restoreFocus = false): void => {
    setOpenPopoverId(null);
    setPopoverVoiceName(undefined);
    setPopoverPosition(null);
    if (restoreFocus) {
      activePopoverTriggerRef.current?.focus();
    }
  }, []);

  const togglePopover = useCallback((id: string, trigger: HTMLButtonElement): void => {
    setOpenPopoverId((currentId) => {
      if (currentId === id) {
        setPopoverVoiceName(undefined);
        setPopoverPosition(null);
        return null;
      }
      activePopoverTriggerRef.current = trigger;
      setPopoverVoiceName(
        editorRef.current ? getEffectiveVoiceName(editorRef.current, draftDocumentRef.current) : undefined,
      );
      return id;
    });
  }, []);

  const setPopoverMenuRef = useCallback((menu: HTMLDivElement | null): void => {
    activePopoverMenuRef.current = menu;
  }, []);

  useEffect(() => {
    if (!openPopoverId) {
      setPopoverPosition(null);
      return;
    }

    const updatePopoverPosition = (): void => {
      const trigger = activePopoverTriggerRef.current;
      if (!trigger) {
        return;
      }

      const triggerBounds = trigger.getBoundingClientRect();
      setPopoverPosition({
        top: triggerBounds.bottom + 4,
        left: triggerBounds.left,
      });
    };
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !activePopoverTriggerRef.current?.contains(target) &&
        !activePopoverMenuRef.current?.contains(target)
      ) {
        closePopover();
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closePopover(true);
      }
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    globalThis.document.addEventListener("pointerdown", handlePointerDown);
    globalThis.document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      globalThis.document.removeEventListener("pointerdown", handlePointerDown);
      globalThis.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePopover, openPopoverId]);

  const refreshSelectionOverlay = useCallback((editor: MonacoEditor, notify: boolean): void => {
    const nextSelection = getSelectionOverlayState(editor);
    setSelectionOverlay(nextSelection);
    if (notify) {
      onSelectionChangeRef.current?.({
        selectedText: nextSelection.selectedText,
        characterCount: nextSelection.characterCount,
        hasSelection: nextSelection.hasSelection,
      });
    }
  }, []);

  const updateActiveTags = useCallback((nextTags: ReadonlySet<string>): void => {
    setActiveTags((currentTags) => {
      if (currentTags.size === nextTags.size && [...currentTags].every((tag) => nextTags.has(tag))) {
        return currentTags;
      }
      return new Set(nextTags);
    });
  }, []);

  const commit = useCallback(
    (nextDocument: SsmlDocument): void => {
      draftDocumentRef.current = nextDocument;
      setDraftDocument(nextDocument);
      onChange?.(nextDocument);
      onSsmlChange?.(buildSsml(nextDocument));
    },
    [onChange, onSsmlChange],
  );

  const handleTextChange = useCallback(
    (value: string): void => {
      commit(updateEditableText(draftDocumentRef.current, value));
      if (editorRef.current) {
        refreshSelectionOverlay(editorRef.current, false);
      }
    },
    [commit, refreshSelectionOverlay],
  );

  const handleInsert = useCallback(
    (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption): void => {
      if (editorRef.current) {
        applySsmlInsertion(editorRef.current, insertion, option);
      }
    },
    [],
  );
  const handleInsertBreak = useCallback(
    (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption): void => {
      if (insertion.tagName && TIMING_INSERTION_TAGS.has(insertion.tagName)) {
        handleInsert(insertion, option);
      }
    },
    [handleInsert],
  );
  const handleInsertProsody = useCallback(
    (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption): void => {
      if (insertion.tagName && PROSODY_INSERTION_TAGS.has(insertion.tagName)) {
        handleInsert(insertion, option);
      }
    },
    [handleInsert],
  );
  const handleInsertText = useCallback(
    (insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption): void => {
      if (insertion.tagName && TEXT_INSERTION_TAGS.has(insertion.tagName)) {
        handleInsert(insertion, option);
      }
    },
    [handleInsert],
  );

  const handleClear = useCallback((): void => {
    commit(clearSsmlDocument(draftDocumentRef.current));
  }, [commit]);

  const handleFormat = useCallback((): void => {
    const value = editorRef.current?.getValue() ?? getEditableText(draftDocumentRef.current);
    commit(updateEditableText(draftDocumentRef.current, formatXmlFragment(value)));
  }, [commit]);

  const handleUndo = useCallback((): void => {
    editorRef.current?.trigger("toolbar", "undo", null);
    editorRef.current?.focus();
  }, []);

  const handleRedo = useCallback((): void => {
    editorRef.current?.trigger("toolbar", "redo", null);
    editorRef.current?.focus();
  }, []);

  const previewSelection = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const selectedSsml = getSelectedSsml(editor, draftDocumentRef.current);
    if (selectedSsml !== null) {
      onPreviewSelectionRef.current?.(selectedSsml);
    }
  }, []);

  const getSelectedSsmlValue = useCallback(
    () => (editorRef.current ? getSelectedSsml(editorRef.current, draftDocumentRef.current) : null),
    [],
  );
  const getCurrentLineSsmlValue = useCallback(
    () => (editorRef.current ? getCurrentLineSsml(editorRef.current, draftDocumentRef.current) : null),
    [],
  );
  const getFullSsml = useCallback(
    () =>
      buildSsml(
        editorRef.current
          ? updateEditableText(draftDocumentRef.current, editorRef.current.getValue())
          : draftDocumentRef.current,
      ),
    [],
  );
  const getOuterVoiceName = useCallback(() => getEditableRegion(draftDocumentRef.current).voiceName, []);

  return {
    editorRef,
    draftDocument,
    text: getEditableText(draftDocument),
    selectionOverlay,
    activeTags,
    isDarkTheme: resolvedTheme === "dark" || (resolvedTheme === "system" && isDark),
    decorationsVisible,
    setDecorationsVisible,
    isHelpOpen,
    setIsHelpOpen,
    syntaxError,
    setSyntaxError,
    helpPanelId,
    commit,
    handleTextChange,
    handleInsert,
    handleInsertBreak,
    handleInsertProsody,
    handleInsertText,
    handleClear,
    handleFormat,
    handleUndo,
    handleRedo,
    previewSelection,
    canPreviewSelection: onPreviewSelection !== undefined,
    refreshSelectionOverlay,
    updateActiveTags,
    getSelectedSsml: getSelectedSsmlValue,
    getCurrentLineSsml: getCurrentLineSsmlValue,
    getFullSsml,
    getOuterVoiceName,
    openPopoverId,
    popoverVoiceName,
    popoverPosition,
    isPopoverOpen: (id: string) => openPopoverId === id,
    togglePopover,
    closePopover,
    setPopoverMenuRef,
  };
}
