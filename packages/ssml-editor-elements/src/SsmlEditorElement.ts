import type * as monaco from "monaco-editor";
import { buildSsml, parseSsml, validateAzureSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument, SsmlElement, SsmlNode } from "@ssml-builder-js/ssml-core";
import { clearSsmlDocument } from "../../ssml-editor-react/src/clearSsmlDocument";
import { getEditableRegion, getEditableText, updateEditableText } from "../../ssml-editor-react/src/editableSsml";
import { formatXmlFragment } from "../../ssml-editor-react/src/formatXml";
import { buildVisualPreview } from "../../ssml-editor-react/src/visualSsmlPreview";
import { registerSsmlCompletionProvider } from "../../ssml-editor-react/src/ssmlCompletion";
import { findActiveSsmlTags, findSsmlVoiceContext } from "../../ssml-editor-react/src/ssmlContext";
import { findSsmlHoverTarget, formatSsmlHover } from "../../ssml-editor-react/src/ssmlHover";
import { createSsmlInsertionEdit } from "../../ssml-editor-react/src/ssmlInsertion";
import {
  DEFAULT_INSERTION_GROUPS,
  SSML_INSERTIONS,
  type SsmlEditorInsertionDefinition,
  type SsmlEditorInsertionOption,
} from "../../ssml-editor-react/src/ssmlInsertions";
import { EDITOR_COPY, TOOLBAR_COPY } from "../../ssml-editor-react/src/locales";
import { getExpressAsStyleCategory, resolveExpressAsStyles } from "../../ssml-editor-react/src/constants/ssmlPresets";
import { TOOLBAR_CSS } from "../../ssml-editor-react/src/styles/editorStyles";
import {
  ADVANCED_TOOLBAR_IDS,
  focusMenuItem,
  getPopoverPosition,
  groupToolbarButtons,
  handleMenuKeyDown,
  handleToolbarKeyDown,
  syncToolbarTabStops,
  ToolbarDocumentHistory,
} from "../../ssml-editor-react/src/toolbar";

type Monaco = typeof monaco;
type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
type MonacoModel = monaco.editor.ITextModel;
type MonacoDisposable = { dispose(): void };

export type SsmlEditorTheme = "vs-dark" | "light" | (string & {});
export type SsmlEditorLocale = "ja" | "en";

export interface SsmlEditorChangeDetail {
  value: string;
}

const HTMLElementBase = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;
let editorInstanceCount = 0;
const STYLE_ID = "ssml-editor-elements-theme";
const STYLE_CSS = `
[data-ssml-editor] {
  --ssml-editor-color: #111827;
  --ssml-editor-bg: #ffffff;
  --ssml-editor-border: #d1d5db;
  --ssml-editor-control-bg: #f9fafb;
  --ssml-editor-control-border: #9ca3af;
  --ssml-editor-active-bg: #dbeafe;
  --ssml-editor-active-border: #2563eb;
  --ssml-editor-preview-bg: #f3f4f6;
}
section[data-ssml-editor] {
  display: grid;
  grid-template-rows: auto minmax(8rem, 1fr);
  gap: 0.75rem;
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 1rem;
  border: 1px solid var(--ssml-editor-border);
  border-radius: 0.5rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-bg);
}
[data-ssml-editor][data-theme="dark"] {
  --ssml-editor-color: #f9fafb;
  --ssml-editor-bg: #1f2937;
  --ssml-editor-border: #374151;
  --ssml-editor-control-bg: #111827;
  --ssml-editor-control-border: #4b5563;
  --ssml-editor-active-bg: #1e3a8a;
  --ssml-editor-active-border: #60a5fa;
  --ssml-editor-preview-bg: #111827;
}
[data-ssml-editor] .ssml-editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
[data-ssml-editor] .ssml-editor-toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
[data-ssml-editor] .ssml-editor-toolbar-separator {
  width: 1px;
  height: 2.25rem;
  margin: 0 0.25rem;
  background: var(--ssml-editor-border);
}
[data-ssml-editor] .ssml-editor-toolbar-dropdown {
  display: inline-block;
}
[data-ssml-editor] .ssml-editor-toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.25rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  font: inherit;
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-toolbar-button:hover,
[data-ssml-editor] .ssml-editor-toolbar-option:hover {
  background: var(--ssml-editor-preview-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
[data-ssml-editor] .ssml-editor-toolbar-button[data-active="true"] {
  border-color: var(--ssml-editor-active-border);
  background: var(--ssml-editor-active-bg);
}
[data-ssml-editor] .ssml-editor-toolbar-icon {
  display: inline-flex;
  width: 1.25rem;
  justify-content: center;
  font-size: 1.1rem;
  line-height: 1;
}
[data-ssml-editor] .ssml-editor-toolbar-chevron {
  font-size: 0.7rem;
  line-height: 1;
}
[data-ssml-editor] .ssml-editor-toolbar-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.25rem;
}
[data-ssml-editor] .ssml-editor-switch-track {
  display: inline-flex;
  align-items: center;
  width: 2.75rem;
  height: 1.5rem;
  padding: 0.1875rem;
  border: 0;
  border-radius: 999px;
  background: var(--ssml-editor-control-border);
  cursor: pointer;
  transition: background-color 0.2s ease;
}
[data-ssml-editor] .ssml-editor-switch-track[aria-checked="true"] {
  background: var(--ssml-editor-active-border);
}
[data-ssml-editor] .ssml-editor-switch-track:focus-visible {
  outline: 2px solid var(--ssml-editor-active-border);
  outline-offset: 2px;
}
[data-ssml-editor] .ssml-editor-switch-thumb {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: var(--ssml-editor-bg);
  transition: transform 0.2s ease;
}
[data-ssml-editor] .ssml-editor-switch-track[aria-checked="true"] .ssml-editor-switch-thumb {
  transform: translateX(1.25rem);
}
[data-ssml-editor].ssml-editor-toolbar-menu {
  position: fixed;
  z-index: 9999;
  display: grid;
  min-width: max-content;
  max-height: min(24rem, calc(100vh - 1rem));
  gap: 0.125rem;
  padding: 0.25rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  background: var(--ssml-editor-control-bg);
  box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 20%);
  overflow-y: auto;
}
[data-ssml-editor] .ssml-editor-toolbar-option {
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: 0.125rem;
  color: var(--ssml-editor-color);
  background: transparent;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-toolbar-option-group {
  display: grid;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  border: 0;
}
[data-ssml-editor] .ssml-editor-toolbar-option-group legend {
  padding: 0.375rem 0.5rem 0.125rem;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
}
[data-ssml-editor] .ssml-editor-help {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  background: var(--ssml-editor-preview-bg);
}
[data-ssml-editor] .ssml-editor-help h3,
[data-ssml-editor] .ssml-editor-help p {
  margin: 0;
}
[data-ssml-editor] .ssml-editor-help-list {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding-left: 1.25rem;
}
[data-ssml-editor] .ssml-editor-help-item {
  list-style: none;
}
[data-ssml-editor] .ssml-editor-help-item details {
  margin-top: 0.375rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  background: var(--ssml-editor-control-bg);
}
[data-ssml-editor] .ssml-editor-help-item summary {
  padding: 0.5rem 0.625rem;
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-help-item details p,
[data-ssml-editor] .ssml-editor-help-item details ul {
  margin: 0.5rem 0.75rem 0.75rem;
  font-size: 0.875rem;
}
[data-ssml-editor] .ssml-editor-display {
  display: grid;
  grid-template-rows: minmax(8rem, 1fr);
  gap: 0.5rem;
  min-height: 0;
}
[data-ssml-editor] .ssml-editor-editor {
  position: relative;
  min-height: 8rem;
  height: 100%;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  overflow: visible;
}
[data-ssml-editor] .ssml-editor-visual {
  display: grid;
  gap: 0.75rem;
  min-height: 8rem;
  padding: 0.75rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
}
[data-ssml-editor] .ssml-editor-visual-layout {
  display: grid;
  grid-template-columns: minmax(12rem, 0.35fr) minmax(16rem, 1fr);
  gap: 1rem;
}
[data-ssml-editor] .ssml-editor-visual-tree ul {
  margin: 0;
  padding-left: 1.25rem;
}
[data-ssml-editor] .ssml-editor-visual button {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  cursor: pointer;
}
[data-ssml-editor] .ssml-editor-visual button[data-selected="true"] {
  border-color: var(--ssml-editor-active-border);
  background: var(--ssml-editor-active-bg);
}
[data-ssml-editor] .ssml-editor-visual textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 6rem;
  padding: 0.5rem;
  color: var(--ssml-editor-color);
  background: var(--ssml-editor-control-bg);
  border: 1px solid var(--ssml-editor-control-border);
  border-radius: 0.25rem;
  font: inherit;
}
[data-ssml-editor] .ssml-editor-visual-actions,
[data-ssml-editor] .ssml-editor-visual-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
[data-ssml-editor] .ssml-editor-visual-errors {
  padding: 0.5rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #b91c1c;
  border-radius: 0.25rem;
}
`.trim();

function injectStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${STYLE_CSS}\n${TOOLBAR_CSS}`;
  document.head.appendChild(style);
}

function isDarkTheme(theme: SsmlEditorTheme): boolean {
  return theme === "vs-dark" || theme.toLowerCase().includes("dark");
}

function isElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function visualElementName(element: SsmlElement): string {
  return element.type === "custom" || element.type === "element" ? element.name : element.type;
}

interface VisualTextLeaf {
  path: number[];
  value: string;
  ancestors: string[];
}

function collectVisualTextLeaves(nodes: SsmlNode[], path: number[] = [], ancestors: string[] = []): VisualTextLeaf[] {
  return nodes.flatMap((node, index) => {
    const currentPath = [...path, index];
    if (typeof node === "string") return [{ path: currentPath, value: node, ancestors }];
    if (node.type === "text") return [{ path: currentPath, value: node.value, ancestors }];
    return collectVisualTextLeaves(node.children ?? [], currentPath, [...ancestors, visualElementName(node)]);
  });
}

function updateVisualNodes(
  nodes: SsmlNode[],
  path: number[],
  update: (node: SsmlNode) => SsmlNode | SsmlNode[],
): SsmlNode[] {
  if (path.length === 0) return nodes;
  const [index, ...rest] = path;
  return nodes.flatMap((node, nodeIndex) => {
    if (nodeIndex !== index) return [node];
    if (rest.length === 0) {
      const next = update(node);
      return Array.isArray(next) ? next : [next];
    }
    if (!isElement(node)) return [node];
    return [{ ...node, children: updateVisualNodes(node.children ?? [], rest, update) }];
  });
}

function updateVisualText(document: SsmlDocument, path: number[], value: string): SsmlDocument {
  return { ...document, children: updateVisualNodes(document.children ?? [], path, () => value) };
}

function wrapVisualText(
  document: SsmlDocument,
  path: number[],
  start: number,
  end: number,
  type: SsmlElement["type"],
  attributes: Record<string, string>,
): SsmlDocument {
  return {
    ...document,
    children: updateVisualNodes(document.children ?? [], path, (node) => {
      const value = typeof node === "string" ? node : node.type === "text" ? node.value : "";
      if (!value || start === end) return node;
      if (type === "break") {
        return [value.slice(0, start), { type, attributes, children: [] } as SsmlElement, value.slice(start)].filter(
          (part) => (typeof part === "string" ? part.length > 0 : true),
        );
      }
      const selected = value.slice(start, end);
      const wrapper = { type, attributes, children: [selected] } as SsmlElement;
      return [value.slice(0, start), wrapper, value.slice(end)].filter((part) =>
        typeof part === "string" ? part.length > 0 : true,
      );
    }),
  };
}

export class SsmlEditorElement extends HTMLElementBase {
  static readonly tagName = "ssml-editor";
  static readonly observedAttributes = [
    "value",
    "theme",
    "readonly",
    "locale",
    "show-toolbar",
    "show-toolbar-labels",
    "show-decorations",
    "edit-mode",
  ];

  private editor: MonacoEditor | null = null;
  private model: MonacoModel | null = null;
  private monaco: Monaco | null = null;
  private root: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private toolbarActions: HTMLElement | null = null;
  private toolbarContext: HTMLElement | null = null;
  private readonly toolbarId = `ssml-editor-elements-${++editorInstanceCount}`;
  private moreOpen = false;
  private clearConfirmation: HTMLElement | null = null;
  private clearConfirmationTrigger: HTMLButtonElement | null = null;
  private display: HTMLElement | null = null;
  private editorContainer: HTMLDivElement | null = null;
  private visualContainer: HTMLDivElement | null = null;
  private helpPanel: HTMLElement | null = null;
  private openMenu: HTMLElement | null = null;
  private openMenuTrigger: HTMLButtonElement | null = null;
  private toolbarButtons = new Map<string, HTMLButtonElement>();
  private contentDisposable: MonacoDisposable | null = null;
  private cursorDisposable: MonacoDisposable | null = null;
  private selectionDisposable: MonacoDisposable | null = null;
  private completionDisposable: MonacoDisposable | null = null;
  private hoverDisposable: MonacoDisposable | null = null;
  private suppressChangeEvent = false;
  private initializationToken = 0;
  private valueState: string | undefined;
  private documentState: SsmlDocument | null = null;
  private decorationsVisible = false;
  private helpOpen = false;
  private visualSelectedPath: number[] | null = null;
  private visualSelection = { start: 0, end: 0 };
  private readonly toolbarDocumentHistory = new ToolbarDocumentHistory();

  get value(): string {
    return this.valueState ?? this.getAttribute("value") ?? "";
  }

  set value(value: string) {
    this.setAttribute("value", value);
  }

  get theme(): SsmlEditorTheme {
    return this.getAttribute("theme") || "light";
  }

  set theme(theme: SsmlEditorTheme) {
    this.setAttribute("theme", theme);
  }

  get readonly(): boolean {
    return this.hasAttribute("readonly");
  }

  set readonly(readonly: boolean) {
    if (readonly) {
      this.setAttribute("readonly", "");
    } else {
      this.removeAttribute("readonly");
    }
  }

  get locale(): SsmlEditorLocale {
    return this.getAttribute("locale") === "en" ? "en" : "ja";
  }

  set locale(locale: SsmlEditorLocale) {
    this.setAttribute("locale", locale);
  }

  get editMode(): "code" | "visual" {
    return this.getAttribute("edit-mode") === "visual" ? "visual" : "code";
  }

  set editMode(mode: "code" | "visual") {
    this.setAttribute("edit-mode", mode);
  }

  private prepareDocument(value: string): string {
    try {
      this.documentState = parseSsml(value);
      return getEditableText(this.documentState);
    } catch {
      this.documentState = null;
      return value;
    }
  }

  connectedCallback(): void {
    if (this.editor || this.root) {
      return;
    }

    injectStyles();
    document.addEventListener("pointerdown", this.handleDocumentPointerDown);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
    window.addEventListener("resize", this.positionOpenMenu);
    window.addEventListener("scroll", this.positionOpenMenu, true);
    this.render();
    const token = ++this.initializationToken;
    void this.initialize(token);
  }

  disconnectedCallback(): void {
    this.initializationToken += 1;
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    window.removeEventListener("resize", this.positionOpenMenu);
    window.removeEventListener("scroll", this.positionOpenMenu, true);
    this.closeMenu();
    this.disposeEditor();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === "value") {
      if (this.valueState !== (newValue ?? "")) this.toolbarDocumentHistory.clear();
      this.valueState = newValue ?? "";
      if (this.editor) {
        const value = newValue ?? "";
        const editableValue = this.prepareDocument(value);
        if (this.editor.getValue() !== editableValue) {
          this.suppressChangeEvent = true;
          try {
            this.editor.setValue(editableValue);
          } finally {
            this.suppressChangeEvent = false;
          }
        }
        this.updateActiveButtons();
      }
      this.renderVisualEditor();
      return;
    }

    if (name === "theme" && this.monaco) {
      this.monaco.editor.setTheme(this.theme);
      this.updateTheme();
      return;
    }

    if (name === "readonly") {
      this.editor?.updateOptions({ readOnly: this.readonly });
      this.renderToolbar();
      return;
    }

    if (name === "locale" || name === "show-toolbar" || name === "show-toolbar-labels") {
      this.renderToolbar();
      this.renderHelp();
      return;
    }

    if (name === "edit-mode") {
      this.updateEditMode();
    }

    if (name === "show-decorations") {
      this.decorationsVisible = newValue !== null;
      this.updateDecorations();
    }
  }

  private render(): void {
    const root = document.createElement("section");
    root.dataset.ssmlEditor = "";
    root.setAttribute("aria-label", EDITOR_COPY[this.locale].editorAriaLabel);
    root.dataset.theme = isDarkTheme(this.theme) ? "dark" : "light";

    const toolbar = document.createElement("div");
    toolbar.className = "ssml-editor-toolbar";
    toolbar.dataset.ssmlEditorToolbar = "";
    const toolbarActions = document.createElement("div");
    toolbarActions.className = "ssml-editor-toolbar-root";
    toolbarActions.setAttribute("role", "toolbar");
    toolbarActions.setAttribute("aria-label", EDITOR_COPY[this.locale].toolbarAriaLabel);
    toolbarActions.addEventListener("keydown", (event) => handleToolbarKeyDown(event, toolbarActions));
    toolbarActions.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLButtonElement) syncToolbarTabStops(toolbarActions, event.target);
    });
    toolbar.append(toolbarActions);

    const display = document.createElement("div");
    display.className = "ssml-editor-display";
    display.dataset.ssmlEditorDisplay = "";
    const editorContainer = document.createElement("div");
    editorContainer.className = "ssml-editor-editor";
    const visualContainer = document.createElement("div");
    visualContainer.className = "ssml-editor-visual";
    display.append(editorContainer, visualContainer);
    root.append(toolbar, display);
    this.replaceChildren(root);

    this.root = root;
    this.toolbar = toolbar;
    this.toolbarActions = toolbarActions;
    this.display = display;
    this.editorContainer = editorContainer;
    this.visualContainer = visualContainer;
    this.renderToolbar();
    this.renderHelp();
    this.updateEditMode();
    this.renderVisualEditor();
  }

  private renderToolbar(): void {
    const toolbar = this.toolbar;
    const toolbarActions = this.toolbarActions;
    if (!toolbar || !toolbarActions) {
      return;
    }

    this.closeMenu();
    this.closeClearConfirmation();
    const copy = EDITOR_COPY[this.locale];
    const text = TOOLBAR_COPY[this.locale];
    toolbar.hidden = this.getAttribute("show-toolbar") === "false";
    toolbar.setAttribute("aria-label", copy.toolbarAriaLabel);
    toolbarActions.setAttribute("aria-label", copy.toolbarAriaLabel);
    toolbarActions.replaceChildren();
    this.toolbarButtons.clear();
    if (toolbar.hidden) {
      return;
    }

    const header = document.createElement("div");
    header.className = "ssml-editor-toolbar-header";
    const modes = document.createElement("fieldset");
    modes.className = "ssml-editor-mode-switch";
    modes.setAttribute("aria-label", text.editMode);
    modes.append(this.createModeButton("visual", text.visualMode), this.createModeButton("code", text.codeMode));
    const context = document.createElement("p");
    context.className = "ssml-editor-toolbar-context";
    context.setAttribute("role", "status");
    this.toolbarContext = context;
    header.append(modes, context);
    toolbarActions.append(header);

    const insertionById = new Map<string, SsmlEditorInsertionDefinition>(
      SSML_INSERTIONS.map((insertion) => [insertion.id, insertion]),
    );
    const toolbarIds =
      this.editMode === "visual"
        ? ["help", "clearAll"]
        : [
            "undo",
            "redo",
            ...DEFAULT_INSERTION_GROUPS.flatMap((group) => group.insertionIds),
            "format",
            "decorations",
            "clearAll",
            "help",
          ];
    const groupByButtonId = new Map<string, string>();
    for (const group of DEFAULT_INSERTION_GROUPS) {
      for (const buttonId of group.insertionIds) {
        groupByButtonId.set(buttonId, group.id);
      }
    }
    groupByButtonId.set("undo", "history");
    groupByButtonId.set("redo", "history");
    groupByButtonId.set("clearAll", "document");
    groupByButtonId.set("format", "document");
    groupByButtonId.set("decorations", "document");
    groupByButtonId.set("help", "help");
    const labels = new Map<string, string>([
      ["history", text.historyGroup],
      ["document", text.documentGroup],
      ["help", text.helpGroup],
      ...DEFAULT_INSERTION_GROUPS.map((group): [string, string] => [group.id, group.labels[this.locale]]),
    ]);
    const appendGroups = (parent: HTMLElement, ids: readonly string[], advanced = false): void => {
      for (const group of groupToolbarButtons(ids, groupByButtonId, labels)) {
        const container = document.createElement("fieldset");
        container.className = "ssml-editor-toolbar-group";
        if (group.label) {
          container.setAttribute("aria-label", group.label);
          const label = document.createElement("legend");
          label.className = "ssml-editor-toolbar-group-label";
          label.setAttribute("aria-hidden", "true");
          label.textContent = group.label;
          container.append(label);
        }
        const controls = document.createElement("div");
        controls.className = "ssml-editor-toolbar-group-controls";
        for (const id of group.buttonIds) {
          const insertion = insertionById.get(id);
          if (insertion) controls.append(this.createInsertionButton(insertion, advanced));
          else if (id === "decorations") controls.append(this.createDecorationsSwitch(advanced));
          else controls.append(this.createActionButton(id, advanced));
        }
        container.append(controls);
        parent.append(container);
      }
    };
    const primary = document.createElement("div");
    primary.className = "ssml-editor-toolbar-actions";
    primary.dataset.ssmlEditorToolbarActions = "";
    appendGroups(
      primary,
      toolbarIds.filter((id) => !ADVANCED_TOOLBAR_IDS.has(id)),
    );
    toolbarActions.append(primary);

    const advancedIds = toolbarIds.filter((id) => ADVANCED_TOOLBAR_IDS.has(id));
    if (advancedIds.length > 0) {
      const advanced = document.createElement("fieldset");
      advanced.className = "ssml-editor-toolbar-advanced";
      advanced.id = `${this.toolbarId}-advanced`;
      advanced.hidden = !this.moreOpen;
      advanced.setAttribute("aria-label", text.moreHeading);
      const heading = document.createElement("p");
      heading.className = "ssml-editor-toolbar-panel-heading";
      heading.textContent = text.moreHeading;
      const groups = document.createElement("div");
      groups.className = "ssml-editor-toolbar-advanced-groups";
      appendGroups(groups, advancedIds, true);
      advanced.append(heading, groups);
      toolbarActions.append(advanced);

      const settings = document.createElement("div");
      settings.className = "ssml-editor-toolbar-group";
      const label = document.createElement("span");
      label.className = "ssml-editor-toolbar-group-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = text.settingsGroup;
      const more = document.createElement("button");
      more.type = "button";
      more.className = "ssml-editor-toolbar-button";
      more.title = text.moreTitle;
      more.textContent = text.more;
      more.setAttribute("aria-expanded", String(this.moreOpen));
      more.setAttribute("aria-controls", advanced.id);
      more.addEventListener("click", () => {
        this.closeMenu();
        this.closeClearConfirmation();
        this.moreOpen = !this.moreOpen;
        advanced.hidden = !this.moreOpen;
        more.setAttribute("aria-expanded", String(this.moreOpen));
        syncToolbarTabStops(toolbarActions);
        if (this.moreOpen) advanced.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      });
      settings.append(label, more);
      primary.append(settings);
    }
    this.updateActiveButtons();
    this.updateToolbarContext();
    syncToolbarTabStops(toolbarActions);
  }

  private createModeButton(mode: "code" | "visual", label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button ssml-editor-mode-button";
    button.dataset.ssmlEditorButton = `edit-mode-${mode}`;
    button.setAttribute("aria-pressed", String(this.editMode === mode));
    button.textContent = label;
    button.addEventListener("click", () => {
      this.editMode = mode;
    });
    return button;
  }

  private createActionButton(id: string, forceLabels = false): HTMLButtonElement {
    const copy = EDITOR_COPY[this.locale];
    const labels: Record<string, string> = {
      undo: copy.undo,
      redo: copy.redo,
      clearAll: copy.clearAll,
      format: copy.format,
      help: copy.help,
    };
    const icons: Record<string, string> = {
      undo: "↩",
      redo: "↪",
      clearAll: "×",
      format: "≡",
      help: "?",
    };
    const titles: Record<string, string> = {
      undo: `${copy.undoTitle} (Ctrl / ⌘ Z)`,
      redo: `${copy.redoTitle} (Ctrl / ⌘ Shift Z)`,
      clearAll: copy.clearAllTitle,
      format: copy.formatTitle,
      help: copy.helpTitle,
    };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button";
    button.dataset.ssmlEditorButton = id;
    if (id === "undo" || id === "redo") button.dataset.compactHistory = "true";
    button.setAttribute("aria-label", labels[id] ?? id);
    button.title = titles[id] ?? labels[id] ?? id;
    button.disabled = id !== "help" && (this.readonly || !this.editor);
    if (id === "help") {
      button.setAttribute("aria-expanded", String(this.helpOpen));
      button.setAttribute("aria-controls", `${this.toolbarId}-help`);
    }
    if (id === "clearAll") {
      button.dataset.danger = "true";
      button.disabled = this.readonly || (this.editMode === "code" ? !this.editor : !this.documentState);
    }
    const icon = document.createElement("span");
    icon.className = "ssml-editor-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = icons[id] ?? "";
    button.append(icon);
    if (forceLabels || this.getAttribute("show-toolbar-labels") !== "false") {
      const label = document.createElement("span");
      label.className = "ssml-editor-toolbar-action-label";
      label.textContent = labels[id] ?? id;
      button.append(label);
    }
    button.addEventListener("click", () => {
      if (id === "help") {
        this.helpOpen = !this.helpOpen;
        button.setAttribute("aria-expanded", String(this.helpOpen));
        this.renderHelp();
      } else if (!this.readonly) {
        if (id === "clearAll") this.showClearConfirmation(button);
        else this.handleAction(id);
      }
    });
    this.toolbarButtons.set(id, button);
    return button;
  }

  private createDecorationsSwitch(forceLabels = false): HTMLElement {
    const copy = EDITOR_COPY[this.locale];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button ssml-editor-decorations-switch";
    button.dataset.ssmlEditorButton = "decorations";
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", copy.decorations);
    if (forceLabels || this.getAttribute("show-toolbar-labels") !== "false") {
      button.append(document.createTextNode(copy.decorations));
    }
    const track = document.createElement("span");
    track.className = "ssml-editor-switch-track";
    track.setAttribute("aria-hidden", "true");
    const thumb = document.createElement("span");
    thumb.className = "ssml-editor-switch-thumb";
    track.append(thumb);
    button.append(track);
    button.addEventListener("click", () => {
      this.decorationsVisible = !this.decorationsVisible;
      this.updateDecorations();
    });
    this.toolbarButtons.set("decorations", button);
    this.updateDecorations();
    return button;
  }

  private createInsertionButton(insertion: SsmlEditorInsertionDefinition, forceLabels = false): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button";
    button.dataset.ssmlEditorButton = insertion.id;
    button.setAttribute("aria-label", insertion.labels[this.locale]);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.disabled = this.readonly || !this.editor;
    button.title =
      insertion.titles?.[this.locale] ?? `${insertion.labels[this.locale]} — ${insertion.descriptions[this.locale]}`;
    const icon = document.createElement("span");
    icon.className = "ssml-editor-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = insertion.icon;
    button.append(icon);
    if (forceLabels || this.getAttribute("show-toolbar-labels") !== "false") {
      button.append(document.createTextNode(insertion.labels[this.locale]));
    }
    const chevron = document.createElement("span");
    chevron.className = "ssml-editor-toolbar-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    button.append(chevron);
    button.addEventListener("click", () => this.toggleInsertionMenu(insertion, button));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      event.stopPropagation();
      this.toggleInsertionMenu(insertion, button, event.key === "ArrowUp" ? "last" : "first");
    });
    this.toolbarButtons.set(insertion.id, button);
    const wrapper = document.createElement("div");
    wrapper.className = "ssml-editor-toolbar-dropdown";
    wrapper.append(button);
    return wrapper;
  }

  private toggleInsertionMenu(
    insertion: SsmlEditorInsertionDefinition,
    trigger: HTMLButtonElement,
    edge?: "first" | "last",
  ): void {
    if (this.readonly || !this.editor || this.editMode !== "code") return;
    if (this.openMenuTrigger === trigger) {
      if (edge && this.openMenu) focusMenuItem(this.openMenu, edge);
      else this.closeMenu();
      return;
    }

    this.closeMenu();
    const menu = this.createInsertionMenu(insertion);
    document.body.append(menu);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", menu.id);
    this.openMenu = menu;
    this.openMenuTrigger = trigger;
    this.positionOpenMenu();
    focusMenuItem(menu, edge);
  }

  private createInsertionMenu(insertion: SsmlEditorInsertionDefinition): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "ssml-editor-toolbar-menu";
    menu.dataset.ssmlEditor = "";
    menu.dataset.theme = isDarkTheme(this.theme) ? "dark" : "light";
    menu.id = `${this.toolbarId}-menu-${insertion.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", insertion.labels[this.locale]);
    menu.tabIndex = -1;
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    menu.addEventListener("keydown", (event) =>
      handleMenuKeyDown(event, menu, (restoreFocus) => this.closeMenu(restoreFocus)),
    );
    const heading = document.createElement("div");
    heading.className = "ssml-editor-toolbar-menu-heading";
    heading.setAttribute("role", "presentation");
    const label = document.createElement("strong");
    label.textContent = insertion.labels[this.locale];
    const description = document.createElement("p");
    description.textContent = insertion.parameterDescription[this.locale];
    heading.append(label, description);
    menu.append(heading);

    const options = this.getInsertionOptions(insertion);
    if (options.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ssml-editor-toolbar-option";
      empty.setAttribute("role", "note");
      empty.textContent =
        insertion.id === "emotion"
          ? EDITOR_COPY[this.locale].styleNotSupported
          : EDITOR_COPY[this.locale].noAvailableOptions;
      menu.append(empty);
    } else {
      for (const group of this.getOptionGroups(insertion, options)) {
        if (group.label) {
          const fieldset = document.createElement("fieldset");
          fieldset.className = "ssml-editor-toolbar-option-group";
          const legend = document.createElement("legend");
          legend.textContent = group.label;
          fieldset.append(legend);
          for (const option of group.options) {
            fieldset.append(this.createOptionButton(insertion, option));
          }
          menu.append(fieldset);
        } else {
          for (const option of group.options) {
            menu.append(this.createOptionButton(insertion, option));
          }
        }
      }
    }
    return menu;
  }

  private getInsertionOptions(insertion: SsmlEditorInsertionDefinition): readonly SsmlEditorInsertionOption[] {
    if (insertion.id !== "emotion") {
      return insertion.options;
    }

    const model = this.model;
    const selection = this.editor?.getSelection();
    const voiceContext =
      model && selection
        ? findSsmlVoiceContext(model.getValue(), model.getOffsetAt(selection.getStartPosition()))
        : undefined;
    const voiceName =
      voiceContext === undefined
        ? this.documentState
          ? getEditableRegion(this.documentState).voiceName
          : undefined
        : voiceContext.voiceName;
    const availableStyles = new Set(
      resolveExpressAsStyles(
        voiceName,
        insertion.options.map((option) => option.value),
      ),
    );
    return insertion.options.filter((option) => availableStyles.has(option.value));
  }

  private getOptionGroups(
    insertion: SsmlEditorInsertionDefinition,
    options: readonly SsmlEditorInsertionOption[],
  ): readonly { label: string; options: readonly SsmlEditorInsertionOption[] }[] {
    if (insertion.id !== "emotion") {
      return [{ label: "", options }];
    }

    const copy = EDITOR_COPY[this.locale];
    const labels: Record<string, string> = {
      emotions: copy.categoryEmotions,
      scenarios: copy.categoryScenarios,
      media: copy.categoryMedia,
      other: copy.categoryOther,
    };
    const categories = ["emotions", "scenarios", "media", "other"] as const;
    return categories
      .map((category) => ({
        label: labels[category],
        options: options.filter((option) => getExpressAsStyleCategory(option.value) === category),
      }))
      .filter((group) => group.options.length > 0);
  }

  private createOptionButton(
    insertion: SsmlEditorInsertionDefinition,
    option: SsmlEditorInsertionOption,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-option";
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", option.labels[this.locale]);
    button.title = option.descriptions?.[this.locale] ?? insertion.descriptions[this.locale];
    const label = document.createElement("span");
    label.textContent = option.labels[this.locale];
    button.append(label);
    if (option.descriptions) {
      button.setAttribute("aria-description", option.descriptions[this.locale]);
      const description = document.createElement("span");
      description.className = "ssml-editor-toolbar-option-description";
      description.setAttribute("aria-hidden", "true");
      description.textContent = option.descriptions[this.locale];
      button.append(description);
    }
    button.disabled = this.readonly;
    button.addEventListener("click", () => {
      if (!this.readonly) {
        this.applyInsertion(insertion, option);
      }
      this.closeMenu();
    });
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  }

  private handleAction(id: string): void {
    if (this.readonly) return;
    if (id === "clearAll" && this.documentState) {
      this.replaceDocument(clearSsmlDocument(this.documentState));
      this.renderVisualEditor();
      return;
    }
    if (!this.editor) {
      return;
    }
    if (id === "undo" || id === "redo") {
      this.editor.trigger("ssml-toolbar", id, null);
      this.editor.focus();
    } else if (id === "format") {
      if (this.documentState) {
        this.replaceDocument(updateEditableText(this.documentState, formatXmlFragment(this.editor.getValue())));
      } else {
        this.replaceEditorValue(formatXmlFragment(this.editor.getValue()));
      }
    }
  }

  private applyInsertion(insertion: SsmlEditorInsertionDefinition, option: SsmlEditorInsertionOption): void {
    const editor = this.editor;
    const model = this.model;
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) {
      return;
    }

    const startOffset = model.getOffsetAt(selection.getStartPosition());
    const endOffset = model.getOffsetAt(selection.getEndPosition());
    const selectedText = selection.isEmpty() ? "" : model.getValueInRange(selection);
    const result = createSsmlInsertionEdit(
      model.getValue(),
      startOffset,
      endOffset,
      insertion.createTemplate(option.value),
      model.getEOL(),
      selectedText,
    );
    editor.pushUndoStop();
    const applied = editor.executeEdits("ssml-toolbar", [{ range: selection, text: result.replacement }]);
    editor.pushUndoStop();
    if (!applied) {
      return;
    }

    const start = model.getPositionAt(startOffset + result.selectionOffset);
    const end = model.getPositionAt(endOffset + result.selectionOffset);
    editor.setSelection({
      selectionStartLineNumber: start.lineNumber,
      selectionStartColumn: start.column,
      positionLineNumber: end.lineNumber,
      positionColumn: end.column,
    });
    editor.focus();
  }

  private replaceEditorValue(value: string): void {
    const editor = this.editor;
    const model = editor?.getModel();
    if (!editor || !model || editor.getValue() === value) {
      return;
    }
    editor.pushUndoStop();
    editor.executeEdits("ssml-editor-toolbar", [
      {
        range: model.getFullModelRange(),
        text: value,
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
    editor.focus();
  }

  private replaceDocument(document: SsmlDocument): void {
    const editor = this.editor;
    const model = editor?.getModel();
    const editableValue = getEditableText(document);
    const fullValue = buildSsml(document);
    const previousDocument = this.documentState;
    const previousValue = this.valueState;
    const documentChanged = !previousDocument || buildSsml(previousDocument) !== fullValue;
    if (model && previousDocument) {
      this.toolbarDocumentHistory.remember(
        model,
        updateEditableText(previousDocument, editor?.getValue() ?? editableValue),
      );
    }
    this.documentState = document;
    this.valueState = fullValue;

    if (!editor || !model || (editor.getValue() === editableValue && !documentChanged)) {
      this.updateActiveButtons();
      this.dispatchChange(fullValue);
      return;
    }

    this.suppressChangeEvent = true;
    try {
      editor.pushUndoStop();
      const applied = editor.executeEdits("ssml-editor-toolbar", [
        {
          range: model.getFullModelRange(),
          text: editableValue,
          forceMoveMarkers: true,
        },
      ]);
      editor.pushUndoStop();
      if (!applied) {
        this.documentState = previousDocument;
        this.valueState = previousValue;
        throw new Error("The editor could not apply the toolbar edit.");
      }
      this.toolbarDocumentHistory.remember(model, document);
    } finally {
      this.suppressChangeEvent = false;
    }
    this.updateActiveButtons();
    this.dispatchChange(fullValue);
    if (this.editMode === "code") editor.focus();
  }

  private dispatchChange(value: string): void {
    if (this.suppressChangeEvent) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SsmlEditorChangeDetail>("change", {
        detail: { value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private updateDecorations(): void {
    const button = this.toolbarButtons.get("decorations");
    if (button) {
      const copy = EDITOR_COPY[this.locale];
      button.setAttribute("aria-checked", String(this.decorationsVisible));
      button.title = this.decorationsVisible ? copy.decorationsHideTitle : copy.decorationsShowTitle;
    }
    this.editor?.updateOptions({
      inlayHints: { enabled: this.decorationsVisible ? "on" : "off" },
    });
  }

  private renderHelp(): void {
    const display = this.display;
    if (!display) {
      return;
    }

    this.helpPanel?.remove();
    this.helpPanel = null;
    const root = this.root;
    if (root) {
      root.setAttribute("aria-label", EDITOR_COPY[this.locale].editorAriaLabel);
      this.updateTheme();
    }
    if (!this.helpOpen || this.getAttribute("show-toolbar") === "false") {
      return;
    }

    const copy = EDITOR_COPY[this.locale];
    const panel = document.createElement("section");
    panel.className = "ssml-editor-help";
    panel.id = `${this.toolbarId}-help`;
    panel.setAttribute("aria-label", copy.helpHeading);
    const heading = document.createElement("h3");
    heading.textContent = copy.helpHeading;
    const description = document.createElement("p");
    description.textContent = copy.helpDescription;
    const list = document.createElement("ul");
    list.className = "ssml-editor-help-list";
    for (const insertion of SSML_INSERTIONS) {
      const item = document.createElement("li");
      item.className = "ssml-editor-help-item";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${insertion.icon} ${insertion.labels[this.locale]} — ${insertion.descriptions[this.locale]}`;
      const parameters = document.createElement("p");
      parameters.textContent = `${copy.parameters}: ${insertion.parameterDescription[this.locale]}`;
      const options = document.createElement("ul");
      for (const option of insertion.options) {
        const optionItem = document.createElement("li");
        optionItem.textContent = `${option.labels[this.locale]}${option.descriptions?.[this.locale] ? ` — ${option.descriptions[this.locale]}` : ""}`;
        options.append(optionItem);
      }
      details.append(summary, parameters, options);
      item.append(details);
      list.append(item);
    }
    panel.append(heading, description, list);
    display.prepend(panel);
    this.helpPanel = panel;
  }

  private updateTheme(): void {
    if (this.root) {
      this.root.dataset.theme = isDarkTheme(this.theme) ? "dark" : "light";
    }
    if (this.openMenu) this.openMenu.dataset.theme = isDarkTheme(this.theme) ? "dark" : "light";
  }

  private updateEditMode(): void {
    this.moreOpen = false;
    this.closeMenu();
    this.closeClearConfirmation();
    if (this.editorContainer && this.visualContainer) {
      const visual = this.editMode === "visual";
      this.editorContainer.hidden = visual;
      this.visualContainer.hidden = !visual;
    }
    this.renderToolbar();
    this.renderVisualEditor();
  }

  private renderVisualEditor(): void {
    const container = this.visualContainer;
    if (!container) return;
    container.replaceChildren();
    if (!this.documentState) {
      const error = document.createElement("p");
      error.className = "ssml-editor-visual-errors";
      error.textContent = "SSML syntax must be valid before visual editing is available.";
      container.append(error);
      return;
    }

    const documentState = this.documentState;
    const leaves = collectVisualTextLeaves(documentState.children ?? []);
    const selectedLeaf = leaves.find((leaf) => leaf.path.join(".") === this.visualSelectedPath?.join(".")) ?? leaves[0];
    const breadcrumb = document.createElement("div");
    breadcrumb.className = "ssml-editor-visual-breadcrumb";
    breadcrumb.textContent = `<speak>${selectedLeaf ? ` / ${selectedLeaf.ancestors.map((name) => `<${name}>`).join(" / ")}` : ""}`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear parent";
    clear.disabled = !this.visualSelectedPath;
    clear.addEventListener("click", () => {
      this.visualSelectedPath = null;
      this.renderVisualEditor();
    });
    breadcrumb.append(clear);
    container.append(breadcrumb);

    const diagnostics = validateAzureSsml(buildSsml(documentState));
    if (diagnostics.length > 0) {
      const errors = document.createElement("div");
      errors.className = "ssml-editor-visual-errors";
      errors.setAttribute("role", "alert");
      for (const diagnostic of diagnostics) {
        const message = document.createElement("div");
        message.textContent = diagnostic.message;
        errors.append(message);
      }
      container.append(errors);
    }

    const layout = document.createElement("div");
    layout.className = "ssml-editor-visual-layout";
    const tree = document.createElement("nav");
    tree.className = "ssml-editor-visual-tree";
    tree.setAttribute("aria-label", "SSML structure tree");
    tree.append(document.createTextNode("Structure"));
    const treeList = document.createElement("ul");
    const renderTree = (nodes: SsmlNode[], parent: HTMLElement, parentPath: number[] = []): void => {
      nodes.forEach((node, index) => {
        if (!isElement(node)) return;
        const path = [...parentPath, index];
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `<${visualElementName(node)}>`;
        button.dataset.selected = String(path.join(".") === this.visualSelectedPath?.join("."));
        button.addEventListener("click", () => {
          this.visualSelectedPath = path;
          this.renderVisualEditor();
        });
        item.append(button);
        if ((node.children ?? []).some(isElement)) {
          const childList = document.createElement("ul");
          renderTree(node.children ?? [], childList, path);
          item.append(childList);
        }
        parent.append(item);
      });
    };
    renderTree(documentState.children ?? [], treeList);
    tree.append(treeList);
    layout.append(tree);

    const form = document.createElement("div");
    form.className = "ssml-editor-visual-form";
    if (selectedLeaf) {
      const label = document.createElement("label");
      label.append(document.createTextNode("Text"));
      const textarea = document.createElement("textarea");
      textarea.value = selectedLeaf.value;
      textarea.readOnly = this.readonly;
      textarea.addEventListener("select", () => {
        this.visualSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
      });
      textarea.addEventListener("input", () => {
        if (!this.readonly) this.replaceDocument(updateVisualText(documentState, selectedLeaf.path, textarea.value));
      });
      label.append(textarea);
      form.append(label);
      const actions = document.createElement("div");
      actions.className = "ssml-editor-visual-actions";
      const wrappers: readonly [string, SsmlElement["type"], Record<string, string>][] = [
        ["Rate", "prosody", { rate: "slow" }],
        ["Pitch", "prosody", { pitch: "high" }],
        ["Emotion", "mstts:express-as", { style: "cheerful" }],
        ["Pause", "break", { time: "500ms" }],
        ["Pronunciation", "phoneme", { alphabet: "ipa", ph: selectedLeaf.value }],
      ];
      for (const [labelText, type, attributes] of wrappers) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = labelText;
        button.disabled = this.readonly;
        button.addEventListener("click", () => {
          const start = this.visualSelection.start === this.visualSelection.end ? 0 : this.visualSelection.start;
          const end =
            this.visualSelection.start === this.visualSelection.end
              ? selectedLeaf.value.length
              : this.visualSelection.end;
          this.replaceDocument(wrapVisualText(documentState, selectedLeaf.path, start, end, type, attributes));
          this.renderVisualEditor();
        });
        actions.append(button);
      }
      const preview = document.createElement("button");
      preview.type = "button";
      preview.textContent = "Preview selection";
      preview.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("preview-selection", {
            detail: { ssml: buildVisualPreview(documentState, selectedLeaf, this.visualSelection) },
            bubbles: true,
            composed: true,
          }),
        );
      });
      actions.append(preview);
      form.append(actions);
    } else {
      form.textContent = "Select an element or text node to edit it.";
    }
    layout.append(form);
    container.append(layout);
  }

  private updateActiveButtons(): void {
    this.updateToolbarContext();
    const editor = this.editor;
    const model = this.model;
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) {
      return;
    }

    const undo = this.toolbarButtons.get("undo");
    const redo = this.toolbarButtons.get("redo");
    if (undo) undo.disabled = this.readonly || !model.canUndo();
    if (redo) redo.disabled = this.readonly || !model.canRedo();
    const activeTags = findActiveSsmlTags(model.getValue(), model.getOffsetAt(selection.getStartPosition()));
    for (const insertion of SSML_INSERTIONS) {
      const button = this.toolbarButtons.get(insertion.id);
      if (button) {
        button.dataset.active = String(
          insertion.tagName !== undefined && activeTags.has(insertion.tagName.toLowerCase()),
        );
      }
    }
    if (this.toolbarActions) syncToolbarTabStops(this.toolbarActions);
  }

  private updateToolbarContext(): void {
    const context = this.toolbarContext;
    if (!context) return;
    const text = TOOLBAR_COPY[this.locale];
    const selection = this.editor?.getSelection();
    const selected = this.model && selection ? this.model.getValueInRange(selection) : "";
    let hint: string = text.cursorHint;
    if (this.readonly) hint = text.readOnlyHint;
    else if (this.editMode === "visual") hint = text.visualHint;
    else if (!this.editor) hint = text.loadingHint;
    else if (selected) hint = text.selectionHint;
    context.replaceChildren();
    if (this.editMode === "code" && selected) {
      const count = document.createElement("span");
      count.className = "ssml-editor-toolbar-selection-count";
      count.textContent = `${selected.length}${EDITOR_COPY[this.locale].selectionCountSuffix}`;
      context.append(count);
    }
    context.append(document.createTextNode(hint));
  }

  private async initialize(token: number): Promise<void> {
    const container = this.editorContainer;
    if (!container) {
      return;
    }

    const monacoModule = await import("monaco-editor");
    if (token !== this.initializationToken || !this.isConnected) {
      return;
    }

    const model = monacoModule.editor.createModel(this.prepareDocument(this.value), "xml");
    this.renderVisualEditor();
    const editor = monacoModule.editor.create(container, {
      model,
      theme: this.theme,
      readOnly: this.readonly,
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: "on",
      inlayHints: { enabled: this.decorationsVisible ? "on" : "off" },
    });

    if (token !== this.initializationToken || !this.isConnected) {
      editor.dispose();
      model.dispose();
      return;
    }

    this.monaco = monacoModule;
    this.model = model;
    this.editor = editor;
    // The model event runs after Undo/Redo restores its alternative version ID.
    this.contentDisposable = model.onDidChangeContent(() => {
      if (this.suppressChangeEvent) return;
      const value = editor.getValue();
      let nextValue = value;
      if (this.documentState) {
        const restoredDocument = this.toolbarDocumentHistory.find(model);
        this.documentState = updateEditableText(restoredDocument ?? this.documentState, value);
        nextValue = buildSsml(this.documentState);
      }
      this.valueState = nextValue;
      this.updateActiveButtons();
      this.dispatchChange(nextValue);
    });
    this.cursorDisposable = editor.onDidChangeCursorPosition(() => this.updateActiveButtons());
    this.selectionDisposable = editor.onDidChangeCursorSelection(() => this.updateToolbarContext());
    this.completionDisposable = registerSsmlCompletionProvider(monacoModule, {
      model,
      getOuterVoiceName: () => (this.documentState ? getEditableRegion(this.documentState).voiceName : undefined),
    });
    this.hoverDisposable = monacoModule.languages.registerHoverProvider("xml", {
      provideHover: (hoverModel, position) => {
        const target = findSsmlHoverTarget(hoverModel.getValue(), position.lineNumber, position.column);
        if (!target) {
          return undefined;
        }

        return {
          contents: [
            {
              isTrusted: false,
              supportHtml: false,
              value: formatSsmlHover(target),
            },
          ],
          range: target.range,
        };
      },
    });
    this.renderToolbar();
  }

  private showClearConfirmation(trigger: HTMLButtonElement): void {
    if (!this.toolbar || this.readonly) return;
    this.closeMenu();
    this.closeClearConfirmation();
    const text = TOOLBAR_COPY[this.locale];
    const panel = document.createElement("div");
    panel.className = "ssml-editor-toolbar-confirmation";
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "false");
    const heading = document.createElement("p");
    heading.className = "ssml-editor-toolbar-panel-heading";
    heading.id = `${this.toolbarId}-clear-heading`;
    heading.textContent = text.clearHeading;
    const description = document.createElement("p");
    description.id = `${this.toolbarId}-clear-description`;
    description.textContent = text.clearDescription;
    panel.setAttribute("aria-labelledby", heading.id);
    panel.setAttribute("aria-describedby", description.id);
    const controls = document.createElement("div");
    controls.className = "ssml-editor-toolbar-group-controls";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ssml-editor-toolbar-button";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.closeClearConfirmation(true));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "ssml-editor-toolbar-button";
    confirm.dataset.danger = "true";
    confirm.textContent = EDITOR_COPY[this.locale].clearAll;
    confirm.addEventListener("click", () => {
      if (!this.readonly) this.handleAction("clearAll");
      this.closeClearConfirmation();
    });
    controls.append(cancel, confirm);
    panel.append(heading, description, controls);
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeClearConfirmation(true);
      }
    });
    this.clearConfirmation = panel;
    this.clearConfirmationTrigger = trigger;
    this.toolbar.append(panel);
    cancel.focus();
  }

  private closeClearConfirmation(restoreFocus = false): void {
    this.clearConfirmation?.remove();
    this.clearConfirmation = null;
    if (restoreFocus) this.clearConfirmationTrigger?.focus();
    this.clearConfirmationTrigger = null;
  }

  private readonly positionOpenMenu = (): void => {
    if (!this.openMenu || !this.openMenuTrigger) return;
    const position = getPopoverPosition(this.openMenuTrigger.getBoundingClientRect(), this.openMenu);
    this.openMenu.style.top = `${position.top}px`;
    this.openMenu.style.left = `${position.left}px`;
  };

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (
      this.openMenu &&
      target instanceof Node &&
      !this.openMenu.contains(target) &&
      !this.openMenuTrigger?.contains(target)
    ) {
      this.closeMenu();
    }
  };

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.openMenu) {
      event.preventDefault();
      this.closeMenu(true);
    }
  };

  private closeMenu(restoreFocus = false): void {
    this.openMenu?.remove();
    this.openMenu = null;
    if (this.openMenuTrigger) {
      this.openMenuTrigger.setAttribute("aria-expanded", "false");
      this.openMenuTrigger.removeAttribute("aria-controls");
      if (restoreFocus) {
        this.openMenuTrigger.focus();
      }
    }
    this.openMenuTrigger = null;
  }

  private disposeEditor(): void {
    this.closeMenu();
    this.closeClearConfirmation();
    this.contentDisposable?.dispose();
    this.contentDisposable = null;
    this.cursorDisposable?.dispose();
    this.cursorDisposable = null;
    this.selectionDisposable?.dispose();
    this.selectionDisposable = null;
    this.completionDisposable?.dispose();
    this.completionDisposable = null;
    this.hoverDisposable?.dispose();
    this.hoverDisposable = null;
    this.editor?.dispose();
    this.editor = null;
    this.model?.dispose();
    this.model = null;
    this.monaco = null;
    this.toolbarDocumentHistory.clear();
    this.root?.remove();
    this.root = null;
    this.toolbar = null;
    this.toolbarActions = null;
    this.toolbarContext = null;
    this.display = null;
    this.editorContainer = null;
    this.visualContainer = null;
    this.helpPanel = null;
    this.toolbarButtons.clear();
  }
}
