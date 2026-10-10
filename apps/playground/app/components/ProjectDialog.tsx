import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildSsml } from "@ssml-builder-js/ssml-core";
import {
  createTemplateDocument,
  createTextDocument,
  getDefaultVoice,
  getErrorMessage,
  getPrimaryProsody,
  getPrimaryVoice,
  getSpeechLanguage,
  importDraft,
  inspectProject,
  MAX_IMPORT_BYTES,
  MAX_TITLE_LENGTH,
  updateProsody,
  rewriteTextDocument,
} from "../studio";
import type { ImportMode, StudioDraft, StudioProject, TemplateId } from "../studio";
import { COMPOSER_COPY, getTemplateLanguage } from "../studioCopy";
import type { StudioCopy, StudioLocale } from "../studioCopy";
import { StudioIcon } from "./StudioIcon";
import type { StudioIconName } from "./StudioIcon";

export type ProjectDialogMode = ImportMode | "templates" | "new" | "rewrite";
const TEMPLATE_IDS: readonly TemplateId[] = ["announcement", "narration", "learning"];
const TEMPLATE_ICONS: Readonly<Record<TemplateId, StudioIconName>> = {
  announcement: "speaker",
  narration: "video",
  learning: "book",
};

interface ProjectDialogProps {
  mode: ProjectDialogMode;
  project: StudioProject;
  locale: StudioLocale;
  copy: StudioCopy;
  onApply: (draft: StudioDraft) => void;
  onClose: () => void;
}

export function ProjectDialog({ mode: initialMode, project, locale, copy, onApply, onClose }: ProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const sourceId = useId();
  const titleId = useId();
  const fileId = useId();
  const readToken = useRef(0);
  const [mode, setMode] = useState(initialMode);
  const [templateId, setTemplateId] = useState<TemplateId>("announcement");
  const [source, setSource] = useState(initialMode === "rewrite" ? inspectProject(project).text : "");
  const [title, setTitle] = useState(initialMode === "rewrite" ? project.title : copy.untitled);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const language = project.document
    ? (getSpeechLanguage(project.document.lang) ?? getTemplateLanguage(locale))
    : getTemplateLanguage(locale);
  const voiceName = (project.document && getPrimaryVoice(project.document)?.name) || getDefaultVoice(language);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = globalThis.document.activeElement;
    dialog?.showModal();
    return () => {
      readToken.current += 1;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const candidate = useMemo((): { draft: StudioDraft | null; error: string | null } => {
    try {
      if (mode === "templates") {
        const template = copy.template[templateId];
        return {
          draft: {
            title: template.title,
            ssml: buildSsml(createTemplateDocument(template.text, getTemplateLanguage(locale), templateId)),
          },
          error: null,
        };
      }
      if (mode === "new") {
        let document = createTextDocument("", language, voiceName);
        if (project.document) {
          document = { ...document, lang: project.document.lang };
          const prosody = getPrimaryProsody(project.document);
          for (const setting of ["rate", "pitch", "volume"] as const) {
            const value = prosody?.[setting];
            if (value !== undefined) document = updateProsody(document, setting, String(value));
          }
        }
        return { draft: { title: copy.untitled, ssml: buildSsml(document) }, error: null };
      }
      if (mode === "rewrite") {
        if (!project.document || !source.trim()) return { draft: null, error: null };
        importDraft(source, "text", title, language, voiceName);
        return { draft: { title, ssml: buildSsml(rewriteTextDocument(project.document, source)) }, error: null };
      }
      if (!source.trim()) return { draft: null, error: null };
      return { draft: importDraft(source, mode, title, language, voiceName), error: null };
    } catch (error) {
      return { draft: null, error: getErrorMessage(error) };
    }
  }, [copy, language, locale, mode, project.document, source, templateId, title, voiceName]);

  const readFile = async (file: File): Promise<void> => {
    const token = ++readToken.current;
    setFileError(null);
    setReadingFile(true);
    try {
      if (!/\.(txt|ssml|xml)$/i.test(file.name) || file.size > MAX_IMPORT_BYTES) {
        throw new Error(copy.fileLimit);
      }
      const content = await file.text();
      if (readToken.current !== token) return;
      setMode(/\.txt$/i.test(file.name) ? "text" : "ssml");
      setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, MAX_TITLE_LENGTH));
      setSource(content);
    } catch (error) {
      if (readToken.current === token) setFileError(`${copy.fileError} ${getErrorMessage(error)}`);
    } finally {
      if (readToken.current === token) setReadingFile(false);
    }
  };

  const composer = COMPOSER_COPY[locale];
  const heading =
    mode === "rewrite"
      ? composer.rewrite
      : mode === "new"
        ? copy.newTitle
        : mode === "templates"
          ? copy.templates
          : copy.importTitle;
  return (
    <dialog
      className="project-dialog"
      ref={dialogRef}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="dialog-heading">
        <div>
          <p className="eyebrow">Speech Studio</p>
          <h2 id={headingId}>{heading}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>
          <StudioIcon name="close" />
        </button>
      </header>
      <p className="dialog-description" id={descriptionId}>
        {mode === "rewrite" ? composer.rewriteHint : mode === "new" ? copy.newHint : copy.replaceHint}
      </p>
      {mode === "templates" ? (
        <>
          <fieldset className="template-options">
            <legend className="sr-only">{copy.templates}</legend>
            {TEMPLATE_IDS.map((id) => (
              <label key={id} className="template-option" data-selected={templateId === id}>
                <input
                  type="radio"
                  name="starter-template"
                  value={id}
                  checked={templateId === id}
                  onChange={() => setTemplateId(id)}
                />
                <span className={`template-icon template-${id}`}>
                  <StudioIcon name={TEMPLATE_ICONS[id]} />
                </span>
                <span>
                  <strong>{copy.template[id].title}</strong>
                  <span>{copy.template[id].description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="template-preview">
            <p>{copy.template[templateId].text}</p>
          </div>
        </>
      ) : mode === "new" ? (
        <div className="new-project-preview">
          <StudioIcon name="file" />
          <strong>{copy.untitled}</strong>
          <code>{voiceName}</code>
        </div>
      ) : (
        <>
          {mode !== "rewrite" && (
            <fieldset className="segmented-control">
              <legend className="sr-only">{copy.importTitle}</legend>
              <button
                type="button"
                disabled={readingFile}
                aria-pressed={mode === "text"}
                onClick={() => setMode("text")}
              >
                {copy.textMode}
              </button>
              <button
                type="button"
                disabled={readingFile}
                aria-pressed={mode === "ssml"}
                onClick={() => setMode("ssml")}
              >
                {copy.ssmlMode}
              </button>
            </fieldset>
          )}
          <label className="field" htmlFor={titleId}>
            <span>{copy.projectTitle}</span>
            <input
              id={titleId}
              value={title}
              disabled={readingFile}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field" htmlFor={sourceId}>
            <span>{mode === "ssml" ? "SSML" : copy.plainText}</span>
            <textarea
              id={sourceId}
              className={mode === "ssml" ? "code-input" : undefined}
              value={source}
              disabled={readingFile}
              onChange={(event) => setSource(event.target.value)}
              placeholder={mode === "ssml" ? '<speak version="1.0" xml:lang="ja-JP">…</speak>' : copy.importPlaceholder}
              spellCheck={mode !== "ssml"}
              rows={8}
              aria-invalid={Boolean(candidate.error)}
            />
          </label>
          {mode !== "rewrite" && (
            <div className="file-picker">
              <label className="button button-secondary" htmlFor={fileId}>
                <StudioIcon name="import" />
                {copy.file}
              </label>
              <input
                id={fileId}
                type="file"
                accept=".txt,.ssml,.xml,text/plain,application/ssml+xml,application/xml"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                  event.target.value = "";
                }}
              />
              <span className="file-limit">{copy.fileLimit}</span>
            </div>
          )}
          {candidate.error && (
            <p className="inline-error" role="status">
              {candidate.error}
            </p>
          )}
          {fileError && (
            <p className="inline-error" role="alert">
              {fileError}
            </p>
          )}
        </>
      )}
      <footer className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          {copy.cancel}
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!candidate.draft || readingFile}
          onClick={() => {
            if (candidate.draft) onApply(candidate.draft);
          }}
        >
          {readingFile ? copy.loading : mode === "new" ? copy.newDraft : copy.apply}
          <StudioIcon name="arrow" />
        </button>
      </footer>
    </dialog>
  );
}
