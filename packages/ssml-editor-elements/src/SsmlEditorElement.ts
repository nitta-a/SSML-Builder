import type * as monaco from "monaco-editor";
import { registerSsmlCompletionProvider } from "../../ssml-editor-react/src/ssmlCompletion";
import { findSsmlHoverTarget, formatSsmlHover } from "../../ssml-editor-react/src/ssmlHover";

type Monaco = typeof monaco;
type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
type MonacoModel = monaco.editor.ITextModel;
type MonacoDisposable = { dispose(): void };

export type SsmlEditorTheme = "vs-dark" | "light" | (string & {});

export interface SsmlEditorChangeDetail {
  value: string;
}

const HTMLElementBase = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export class SsmlEditorElement extends HTMLElementBase {
  static readonly tagName = "ssml-editor";
  static readonly observedAttributes = ["value", "theme", "readonly"];

  private editor: MonacoEditor | null = null;
  private model: MonacoModel | null = null;
  private monaco: Monaco | null = null;
  private container: HTMLDivElement | null = null;
  private contentDisposable: MonacoDisposable | null = null;
  private completionDisposable: MonacoDisposable | null = null;
  private hoverDisposable: MonacoDisposable | null = null;
  private suppressChangeEvent = false;
  private initializationToken = 0;
  private valueState: string | undefined;

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

  connectedCallback(): void {
    if (this.editor || this.container) {
      return;
    }

    this.render();
    const token = ++this.initializationToken;
    void this.initialize(token);
  }

  disconnectedCallback(): void {
    this.initializationToken += 1;
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
      return;
    }

    if (name === "readonly") {
      this.editor?.updateOptions({ readOnly: this.readonly });
    }
  }

  private render(): void {
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    this.replaceChildren(container);
    this.container = container;
  }

  private async initialize(token: number): Promise<void> {
    const container = this.container;
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
  }

  private disposeEditor(): void {
    this.contentDisposable?.dispose();
    this.contentDisposable = null;
    this.completionDisposable?.dispose();
    this.completionDisposable = null;
    this.hoverDisposable?.dispose();
    this.hoverDisposable = null;
    this.editor?.dispose();
    this.editor = null;
    this.model?.dispose();
    this.model = null;
    this.monaco = null;
    this.container?.remove();
    this.container = null;
  }
}
