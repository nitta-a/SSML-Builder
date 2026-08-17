import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { SsmlEditorElement, SsmlEditorTheme } from "@ssml-builder-js/ssml-editor-elements";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ssml-editor": DetailedHTMLProps<HTMLAttributes<SsmlEditorElement>, SsmlEditorElement> & {
        value?: string;
        theme?: SsmlEditorTheme;
        readonly?: boolean;
      };
    }
  }
}

export {};
