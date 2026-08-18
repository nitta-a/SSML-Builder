import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { SsmlEditorElement, SsmlEditorLocale, SsmlEditorTheme } from "@ssml-builder-js/ssml-editor-elements";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ssml-editor": DetailedHTMLProps<HTMLAttributes<SsmlEditorElement>, SsmlEditorElement> & {
        value?: string;
        theme?: SsmlEditorTheme;
        readonly?: boolean;
        locale?: SsmlEditorLocale;
        "show-toolbar"?: boolean;
        "show-toolbar-labels"?: boolean;
        "show-decorations"?: boolean;
      };
    }
  }
}
