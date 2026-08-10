import React from "react";
import type { SsmlDocument } from "@ssml-builder/ssml-core";

export interface SsmlEditorProps {
  document: SsmlDocument;
  onChange?: (content: string) => void;
}

export function SsmlEditor({ document, onChange }: SsmlEditorProps): React.ReactElement {
  return (
    <textarea
      value={document.content}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ width: "100%", height: "100%", fontFamily: "monospace" }}
    />
  );
}
