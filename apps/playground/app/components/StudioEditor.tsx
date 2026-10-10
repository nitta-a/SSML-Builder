import { useEffect, useRef } from "react";
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import { defineSsmlEditorElement } from "@ssml-builder-js/ssml-editor-elements";
import type { SsmlEditorElement } from "@ssml-builder-js/ssml-editor-elements";
import { SsmlEditor } from "@ssml-builder-js/ssml-editor-react";
import type { StudioCopy, StudioLocale } from "../studioCopy";
import type { StudioTheme } from "../hooks/useStudioPreferences";

export type EditorImplementation = "react" | "web-component";

interface StudioEditorProps {
  document: SsmlDocument | null;
  ssml: string;
  locale: StudioLocale;
  theme: StudioTheme | null;
  implementation: EditorImplementation;
  ready: boolean;
  copy: StudioCopy;
  onDocumentChange: (document: SsmlDocument) => void;
  onSsmlChange: (ssml: string) => void;
  onPreview?: (ssml: string) => void;
  previewUnavailableReason: string;
  onError: (message: string) => void;
}

export function StudioEditor({
  document,
  ssml,
  locale,
  theme,
  implementation,
  ready,
  copy,
  onDocumentChange,
  onSsmlChange,
  onPreview,
  previewUnavailableReason,
  onError,
}: StudioEditorProps) {
  const webComponentRef = useRef<SsmlEditorElement>(null);
  const editorLocale = locale === "ja" ? "ja" : "en";

  useEffect(() => {
    defineSsmlEditorElement();
  }, []);

  useEffect(() => {
    const editor = webComponentRef.current;
    if (!editor || !ready || implementation !== "web-component") return;
    const handleChange = (event: Event): void => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
      if (detail === null || typeof detail !== "object" || !("value" in detail) || typeof detail.value !== "string") {
        onError("The editor returned an invalid change event.");
        return;
      }
      onSsmlChange(detail.value);
    };
    const handlePreview = (event: Event): void => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
      if (detail === null || typeof detail !== "object" || !("ssml" in detail) || typeof detail.ssml !== "string") {
        onError("The editor returned an invalid preview event.");
        return;
      }
      if (!onPreview) {
        onError(previewUnavailableReason);
        return;
      }
      onPreview(detail.ssml);
    };
    editor.addEventListener("change", handleChange);
    editor.addEventListener("preview-selection", handlePreview);
    return () => {
      editor.removeEventListener("change", handleChange);
      editor.removeEventListener("preview-selection", handlePreview);
    };
  }, [implementation, onError, onPreview, onSsmlChange, previewUnavailableReason, ready]);

  if (!ready) {
    return (
      <div className="editor-loading" role="status">
        {copy.loading}
      </div>
    );
  }
  if (implementation === "web-component") {
    return (
      <div className="web-component-editor">
        <ssml-editor
          ref={webComponentRef}
          value={ssml}
          theme={theme === "dark" ? "vs-dark" : "light"}
          locale={editorLocale}
        />
      </div>
    );
  }
  if (!document) {
    return (
      <label className="source-repair">
        <span>{copy.ssmlMode}</span>
        <textarea value={ssml} onChange={(event) => onSsmlChange(event.target.value)} spellCheck={false} rows={14} />
      </label>
    );
  }
  return (
    <SsmlEditor
      document={document}
      onChange={onDocumentChange}
      onPreviewSelection={onPreview}
      locale={editorLocale}
      theme={theme ?? "system"}
      className="studio-ssml-editor"
      style={{ padding: 0, border: 0, borderRadius: 0, backgroundColor: "transparent" }}
      height="clamp(17rem, 36vh, 25rem)"
      fontSize={14}
      lineNumbers="on"
      wordWrap="on"
    />
  );
}
