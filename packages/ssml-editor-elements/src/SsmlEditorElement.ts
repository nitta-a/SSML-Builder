import type * as monaco from "monaco-editor";
import { buildSsml, parseSsml } from "@ssml-builder-js/ssml-core";
import { clearSsmlDocument } from "../../ssml-editor-react/src/clearSsmlDocument";
import { formatXmlFragment } from "../../ssml-editor-react/src/formatXml";
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
import { EDITOR_COPY } from "../../ssml-editor-react/src/locales";
import { getExpressAsStyleCategory, resolveExpressAsStyles } from "../../ssml-editor-react/src/constants/ssmlPresets";

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
[data-ssml-editor] .ssml-editor-toolbar-menu {
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
  grid-template-rows: auto minmax(8rem, 1fr);
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
`.trim();

function injectStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

function isDarkTheme(theme: SsmlEditorTheme): boolean {
  return theme === "vs-dark" || theme.toLowerCase().includes("dark");
}

function getMenuPosition(trigger: HTMLElement, menu: HTMLElement): { top: number; left: number } {
  const bounds = trigger.getBoundingClientRect();
  const margin = 8;
  const top = Math.min(bounds.bottom + 4, window.innerHeight - menu.offsetHeight - margin);
  const left = Math.min(bounds.left, window.innerWidth - menu.offsetWidth - margin);
  return {
    top: Math.max(margin, top),
    left: Math.max(margin, left),
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
  ];

  private editor: MonacoEditor | null = null;
  private model: MonacoModel | null = null;
  private monaco: Monaco | null = null;
  private root: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private toolbarActions: HTMLElement | null = null;
  private display: HTMLElement | null = null;
  private editorContainer: HTMLDivElement | null = null;
  private helpPanel: HTMLElement | null = null;
  private openMenu: HTMLElement | null = null;
  private openMenuTrigger: HTMLButtonElement | null = null;
  private toolbarButtons = new Map<string, HTMLButtonElement>();
  private contentDisposable: MonacoDisposable | null = null;
  private cursorDisposable: MonacoDisposable | null = null;
  private completionDisposable: MonacoDisposable | null = null;
  private hoverDisposable: MonacoDisposable | null = null;
  private suppressChangeEvent = false;
  private initializationToken = 0;
  private valueState: string | undefined;
  private decorationsVisible = false;
  private helpOpen = false;

  get value(): string {
    return this.editor?.getValue() ?? this.valueState ?? this.getAttribute("value") ?? "";
  }

  set value(value: string) {
    this.valueState = value;
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

  connectedCallback(): void {
    if (this.editor || this.root) {
      return;
    }

    injectStyles();
    document.addEventListener("pointerdown", this.handleDocumentPointerDown);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
    this.render();
    const token = ++this.initializationToken;
    void this.initialize(token);
  }

  disconnectedCallback(): void {
    this.initializationToken += 1;
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    this.closeMenu();
    this.disposeEditor();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === "value") {
      this.valueState = newValue ?? "";
      if (this.editor) {
        const value = newValue ?? "";
        if (this.editor.getValue() !== value) {
          this.suppressChangeEvent = true;
          try {
            this.editor.setValue(value);
          } finally {
            this.suppressChangeEvent = false;
          }
        }
      }
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
    toolbarActions.className = "ssml-editor-toolbar-actions";
    toolbarActions.setAttribute("role", "toolbar");
    toolbarActions.setAttribute("aria-label", EDITOR_COPY[this.locale].toolbarAriaLabel);
    toolbarActions.dataset.ssmlEditorToolbarActions = "";
    toolbar.append(toolbarActions);

    const display = document.createElement("div");
    display.className = "ssml-editor-display";
    display.dataset.ssmlEditorDisplay = "";
    const editorContainer = document.createElement("div");
    editorContainer.className = "ssml-editor-editor";
    display.append(editorContainer);
    root.append(toolbar, display);
    this.replaceChildren(root);

    this.root = root;
    this.toolbar = toolbar;
    this.toolbarActions = toolbarActions;
    this.display = display;
    this.editorContainer = editorContainer;
    this.renderToolbar();
    this.renderHelp();
  }

  private renderToolbar(): void {
    const toolbar = this.toolbar;
    const toolbarActions = this.toolbarActions;
    if (!toolbar || !toolbarActions) {
      return;
    }

    this.closeMenu();
    const copy = EDITOR_COPY[this.locale];
    toolbar.hidden = this.getAttribute("show-toolbar") === "false";
    toolbar.setAttribute("aria-label", copy.toolbarAriaLabel);
    toolbarActions.setAttribute("aria-label", copy.toolbarAriaLabel);
    toolbarActions.replaceChildren();
    this.toolbarButtons.clear();
    if (toolbar.hidden) {
      return;
    }

    const insertionById = new Map(SSML_INSERTIONS.map((insertion) => [insertion.id, insertion]));
    const toolbarIds = [
      "undo",
      "redo",
      ...DEFAULT_INSERTION_GROUPS.flatMap((group) => group.insertionIds),
      "clearAll",
      "format",
      "decorations",
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

    let previousGroup: string | undefined;
    for (const id of toolbarIds) {
      const group = groupByButtonId.get(id);
      if (previousGroup !== undefined && group !== previousGroup) {
        const separator = document.createElement("span");
        separator.className = "ssml-editor-toolbar-separator";
        separator.setAttribute("aria-hidden", "true");
        toolbarActions.append(separator);
      }
      previousGroup = group;

      const insertion = insertionById.get(id);
      if (insertion) {
        toolbarActions.append(this.createInsertionButton(insertion));
      } else if (id === "decorations") {
        toolbarActions.append(this.createDecorationsSwitch());
      } else {
        toolbarActions.append(this.createActionButton(id));
      }
    }
    this.updateActiveButtons();
  }

  private createActionButton(id: string): HTMLButtonElement {
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
      undo: copy.undoTitle,
      redo: copy.redoTitle,
      clearAll: copy.clearAllTitle,
      format: copy.formatTitle,
      help: copy.helpTitle,
    };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button";
    button.dataset.ssmlEditorButton = id;
    button.setAttribute("aria-label", labels[id] ?? id);
    button.title = titles[id] ?? labels[id] ?? id;
    button.disabled = this.readonly && id !== "help";
    if (id === "help") {
      button.setAttribute("aria-expanded", String(this.helpOpen));
    }
    const icon = document.createElement("span");
    icon.className = "ssml-editor-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = icons[id] ?? "";
    button.append(icon);
    if (this.hasAttribute("show-toolbar-labels")) {
      button.append(document.createTextNode(labels[id] ?? id));
    }
    button.addEventListener("click", () => {
      if (id === "help") {
        this.helpOpen = !this.helpOpen;
        button.setAttribute("aria-expanded", String(this.helpOpen));
        this.renderHelp();
      } else if (!this.readonly) {
        this.handleAction(id);
      }
    });
    this.toolbarButtons.set(id, button);
    return button;
  }

  private createDecorationsSwitch(): HTMLElement {
    const copy = EDITOR_COPY[this.locale];
    const wrapper = document.createElement("div");
    wrapper.className = "ssml-editor-toolbar-switch";
    const icon = document.createElement("span");
    icon.className = "ssml-editor-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "☆";
    wrapper.append(icon);
    if (this.hasAttribute("show-toolbar-labels")) {
      wrapper.append(document.createTextNode(copy.decorations));
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-switch-track";
    button.dataset.ssmlEditorButton = "decorations";
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", copy.decorations);
    button.addEventListener("click", () => {
      this.decorationsVisible = !this.decorationsVisible;
      this.updateDecorations();
    });
    wrapper.append(button);
    this.toolbarButtons.set("decorations", button);
    this.updateDecorations();
    return wrapper;
  }

  private createInsertionButton(insertion: SsmlEditorInsertionDefinition): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssml-editor-toolbar-button";
    button.dataset.ssmlEditorButton = insertion.id;
    button.setAttribute("aria-label", insertion.labels[this.locale]);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.title =
      insertion.titles?.[this.locale] ?? `${insertion.labels[this.locale]} — ${insertion.descriptions[this.locale]}`;
    const icon = document.createElement("span");
    icon.className = "ssml-editor-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = insertion.icon;
    button.append(icon);
    if (this.hasAttribute("show-toolbar-labels")) {
      button.append(document.createTextNode(insertion.labels[this.locale]));
    }
    const chevron = document.createElement("span");
    chevron.className = "ssml-editor-toolbar-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    button.append(chevron);
    button.addEventListener("click", () => this.toggleInsertionMenu(insertion, button));
    this.toolbarButtons.set(insertion.id, button);
    const wrapper = document.createElement("div");
    wrapper.className = "ssml-editor-toolbar-dropdown";
    wrapper.append(button);
    return wrapper;
  }

  private toggleInsertionMenu(insertion: SsmlEditorInsertionDefinition, trigger: HTMLButtonElement): void {
    if (this.openMenuTrigger === trigger) {
      this.closeMenu();
      return;
    }

    this.closeMenu();
    const menu = this.createInsertionMenu(insertion);
    document.body.append(menu);
    const position = getMenuPosition(trigger, menu);
    menu.style.top = `${position.top}px`;
    menu.style.left = `${position.left}px`;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", menu.id);
    this.openMenu = menu;
    this.openMenuTrigger = trigger;
  }

  private createInsertionMenu(insertion: SsmlEditorInsertionDefinition): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "ssml-editor-toolbar-menu";
    menu.dataset.ssmlEditor = "";
    menu.dataset.theme = isDarkTheme(this.theme) ? "dark" : "light";
    menu.id = `ssml-editor-elements-menu-${insertion.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", insertion.labels[this.locale]);
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());

    const options = this.getInsertionOptions(insertion);
    if (options.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ssml-editor-toolbar-option";
      empty.textContent = EDITOR_COPY[this.locale].noAvailableOptions;
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
    const voiceName =
      model && selection
        ? findSsmlVoiceContext(model.getValue(), model.getOffsetAt(selection.getStartPosition()))?.voiceName
        : undefined;
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
    button.title = option.descriptions?.[this.locale] ?? insertion.descriptions[this.locale];
    button.textContent = option.labels[this.locale];
    button.disabled = this.readonly;
    button.addEventListener("click", () => {
      if (!this.readonly) {
        this.applyInsertion(insertion, option);
      }
      this.closeMenu(true);
    });
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  }

  private handleAction(id: string): void {
    if (!this.editor) {
      return;
    }
    if (id === "undo" || id === "redo") {
      this.editor.trigger("ssml-toolbar", id, null);
      this.editor.focus();
    } else if (id === "clearAll") {
      try {
        this.replaceEditorValue(buildSsml(clearSsmlDocument(parseSsml(this.editor.getValue()))));
      } catch {
        return;
      }
    } else if (id === "format") {
      this.replaceEditorValue(formatXmlFragment(this.editor.getValue()));
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
    if (!this.editor || this.editor.getValue() === value) {
      return;
    }
    this.editor.pushUndoStop();
    this.editor.setValue(value);
    this.editor.pushUndoStop();
    this.editor.focus();
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
  }

  private updateActiveButtons(): void {
    const editor = this.editor;
    const model = this.model;
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) {
      return;
    }

    const activeTags = findActiveSsmlTags(model.getValue(), model.getOffsetAt(selection.getStartPosition()));
    for (const insertion of SSML_INSERTIONS) {
      const button = this.toolbarButtons.get(insertion.id);
      if (button) {
        button.dataset.active = String(
          insertion.tagName !== undefined && activeTags.has(insertion.tagName.toLowerCase()),
        );
      }
    }
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

    const model = monacoModule.editor.createModel(this.value, "xml");
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
    this.contentDisposable = editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      this.valueState = value;
      this.updateActiveButtons();
      if (!this.suppressChangeEvent) {
        this.dispatchEvent(
          new CustomEvent<SsmlEditorChangeDetail>("change", {
            detail: { value },
            bubbles: true,
            composed: true,
          }),
        );
      }
    });
    this.cursorDisposable = editor.onDidChangeCursorPosition(() => this.updateActiveButtons());
    this.completionDisposable = registerSsmlCompletionProvider(monacoModule, {
      model,
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
    this.updateActiveButtons();
  }

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
    this.contentDisposable?.dispose();
    this.contentDisposable = null;
    this.cursorDisposable?.dispose();
    this.cursorDisposable = null;
    this.completionDisposable?.dispose();
    this.completionDisposable = null;
    this.hoverDisposable?.dispose();
    this.hoverDisposable = null;
    this.editor?.dispose();
    this.editor = null;
    this.model?.dispose();
    this.model = null;
    this.monaco = null;
    this.root?.remove();
    this.root = null;
    this.toolbar = null;
    this.toolbarActions = null;
    this.display = null;
    this.editorContainer = null;
    this.helpPanel = null;
    this.toolbarButtons.clear();
  }
}
