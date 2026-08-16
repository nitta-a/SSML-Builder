import { useCallback, useEffect, useId, useRef, useState } from "react";
import { buildPartialSsml, buildSsml, parseSsml } from "@ssml-builder-js/ssml-core";
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
import { formatXmlFragment, INTRINSICALLY_EMPTY_ELEMENTS } from "../formatXml";
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

interface EditableStartTag {
  name: string;
  selfClosing: boolean;
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

function getSsmlElementName(element: SsmlElement): string {
  return element.type === "custom" || element.type === "element" ? element.name : element.type;
}

function findEditableTagEnd(source: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index;
    }
  }
  return source.length;
}

function collectEditableStartTags(source: string): EditableStartTag[] {
  const tags: EditableStartTag[] = [];
  let index = 0;

  while (index < source.length) {
    if (source[index] !== "<") {
      index += 1;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + 9);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("</", index) || source.startsWith("<!", index)) {
      const end = findEditableTagEnd(source, index);
      index = end === source.length ? source.length : end + 1;
      continue;
    }

    const end = findEditableTagEnd(source, index);
    if (end === source.length) {
      break;
    }
    const raw = source.slice(index, end + 1);
    const match = raw.match(/^<([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (match) {
      tags.push({ name: match[1], selfClosing: /\/\s*>$/.test(raw) });
    }
    index = end + 1;
  }

  return tags;
}

function preserveEmptyPairElements(
  nodes: SsmlNode[],
  startTags: readonly EditableStartTag[],
  startTagIndex: { value: number },
): SsmlNode[] {
  return nodes.map((node) => {
    if (!isSsmlElement(node)) {
      return node;
    }

    const elementName = getSsmlElementName(node);
    const startTag = startTags[startTagIndex.value];
    startTagIndex.value += 1;
    if (node.children === undefined || node.children.length === 0) {
      return startTag?.name === elementName && !startTag.selfClosing && !INTRINSICALLY_EMPTY_ELEMENTS.has(elementName)
        ? { ...node, children: [""] }
        : node;
    }

    const children = preserveEmptyPairElements(node.children, startTags, startTagIndex);
    if (children.every((child, index) => child === node.children?.[index])) {
      return node;
    }
    return { ...node, children };
  });
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

function findFirstElementPath(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => boolean,
  ancestors: readonly SsmlElement[] = [],
): SsmlElement[] | undefined {
  for (const node of nodes) {
    if (!isSsmlElement(node)) {
      continue;
    }

    const path = [...ancestors, node];
    if (predicate(node)) {
      return path;
    }

    const childPath = findFirstElementPath(node.children ?? [], predicate, path);
    if (childPath) {
      return childPath;
    }
  }
  return undefined;
}

function updateFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
  update: (element: T) => SsmlElement,
): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || !isSsmlElement(node)) {
      return node;
    }

    if (predicate(node)) {
      updated = true;
      return update(node);
    }

    if (node.children) {
      const result = updateFirstElement(node.children, predicate, update);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function withChildren(document: SsmlDocument, children: SsmlNode[]): SsmlDocument {
  const nextDocument: SsmlDocument = { ...document, children };
  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }
  return nextDocument;
}

function parseEditableText(value: string, lang: string): SsmlNode[] {
  try {
    const wrapper = buildSsml({
      version: "1.0",
      lang,
      children: [],
    });
    const openingTagEnd = wrapper.indexOf(">") + 1;
    const children = parseSsml(`${wrapper.slice(0, openingTagEnd)}${value}</speak>`).children ?? [];
    return children.some(isSsmlElement)
      ? preserveEmptyPairElements(children, collectEditableStartTags(value), { value: 0 })
      : [value];
  } catch {
    return [value];
  }
}

function serializeEditableText(nodes: SsmlNode[], lang: string): string {
  if (nodes.length === 1 && typeof nodes[0] === "string") {
    return nodes[0];
  }

  const xml = buildSsml({
    version: "1.0",
    lang,
    children: nodes,
  });
  const contentStart = xml.indexOf(">") + 1;
  return xml.slice(contentStart, -"</speak>".length);
}

function getEditableRegion(document: SsmlDocument): { children: SsmlNode[]; voiceName?: string } {
  const children = getDocumentChildren(document);
  const path = findFirstElementPath(children, isProsody) ?? findFirstElementPath(children, isVoice);
  const element = path ? path[path.length - 1] : undefined;
  const voice = path ? [...path].reverse().find(isVoice) : undefined;
  return {
    children: element?.children ?? children,
    ...(voice ? { voiceName: voice.name } : {}),
  };
}

function getEditableChildren(document: SsmlDocument): SsmlNode[] {
  return getEditableRegion(document).children;
}

function getEditableText(document: SsmlDocument): string {
  return serializeEditableText(getEditableChildren(document), document.lang);
}

function updateText(document: SsmlDocument, value: string): SsmlDocument {
  const nextChildren = parseEditableText(value, document.lang);
  const editableChildren = nextChildren.length > 0 ? nextChildren : [value];
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    children: editableChildren,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: editableChildren,
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, editableChildren);
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
      commit(updateText(draftDocumentRef.current, value));
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
    commit(updateText(draftDocumentRef.current, formatXmlFragment(value)));
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
          ? updateText(draftDocumentRef.current, editorRef.current.getValue())
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
