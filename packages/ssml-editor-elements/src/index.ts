export { SsmlEditorElement } from "./SsmlEditorElement";
export type { SsmlEditorChangeDetail, SsmlEditorTheme } from "./SsmlEditorElement";

export function defineSsmlEditorElement(): void {
  if (typeof customElements === "undefined" || customElements.get(SsmlEditorElement.tagName)) {
    return;
  }

  customElements.define(SsmlEditorElement.tagName, SsmlEditorElement);
}

import { SsmlEditorElement } from "./SsmlEditorElement";
