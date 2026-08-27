import { SsmlEditorElement } from "./SsmlEditorElement";

export { SsmlEditorElement } from "./SsmlEditorElement";
export type { SsmlEditorChangeDetail, SsmlEditorLocale, SsmlEditorTheme } from "./SsmlEditorElement";
export type SsmlEditorEditMode = "code" | "visual";

export function defineSsmlEditorElement(): void {
  if (typeof customElements === "undefined" || customElements.get(SsmlEditorElement.tagName)) {
    return;
  }

  customElements.define(SsmlEditorElement.tagName, SsmlEditorElement);
}
