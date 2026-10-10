"use client";

import { useCallback, useMemo, useState } from "react";
import { buildSsml } from "@ssml-builder-js/ssml-core";
import { DeveloperTools } from "./components/DeveloperTools";
import { PreviewPanel } from "./components/PreviewPanel";
import { ProjectDialog } from "./components/ProjectDialog";
import type { ProjectDialogMode } from "./components/ProjectDialog";
import { StudioEditor } from "./components/StudioEditor";
import type { EditorImplementation } from "./components/StudioEditor";
import { StudioIcon } from "./components/StudioIcon";
import { VoicePanel } from "./components/VoicePanel";
import { useAudioPreview } from "./hooks/useAudioPreview";
import { useBrowserReadout } from "./hooks/useBrowserReadout";
import { useStudioDraft } from "./hooks/useStudioDraft";
import { useStudioPreferences } from "./hooks/useStudioPreferences";
import { createTemplateDocument, downloadName, getErrorMessage, inspectProject, MAX_TITLE_LENGTH } from "./studio";
import type { StudioDraft } from "./studio";
import { COMPOSER_COPY, isStudioLocale, LOCALE_OPTIONS, STUDIO_COPY } from "./studioCopy";

const starter = STUDIO_COPY.ja.template.announcement;
const INITIAL_DRAFT: StudioDraft = {
  title: starter.title,
  ssml: buildSsml(createTemplateDocument(starter.text, "ja-JP", "announcement")),
};

export default function Home() {
  const preferences = useStudioPreferences();
  const { locale, theme } = preferences;
  const copy = STUDIO_COPY[locale];
  const composer = COMPOSER_COPY[locale];
  const draft = useStudioDraft(INITIAL_DRAFT);
  const { project } = draft;
  const audio = useAudioPreview();
  const readout = useBrowserReadout(project.ssml);
  const [implementation, setImplementation] = useState<EditorImplementation>("react");
  const [dialog, setDialog] = useState<ProjectDialogMode | null>(null);
  const [previousDraft, setPreviousDraft] = useState<StudioDraft | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [sourceTab, setSourceTab] = useState<"ssml" | "text">("ssml");
  const [editingSpeech, setEditingSpeech] = useState(false);
  const { ssml, document: scriptDocument } = project;
  const inspection = useMemo(() => inspectProject({ ssml, document: scriptDocument }), [scriptDocument, ssml]);
  const hasErrors = Boolean(inspection.syntaxError) || inspection.diagnostics.some((item) => item.severity === "error");
  const warnings = inspection.diagnostics.filter((item) => item.severity === "warning");
  const validationLabel = hasErrors ? copy.invalid : inspection.canSynthesize ? copy.valid : copy.empty;
  const previewUnavailableReason = {
    checking: copy.azureChecking,
    configured: copy.generating,
    missing: copy.azureMissing,
    error: copy.azureError,
  }[audio.configuration];
  const stepTargets = ["script", "voice", "preview"];

  const reportError = useCallback((text: string): void => setNotice({ text, error: true }), []);

  const previewPassage = useCallback(
    (ssml: string): void => {
      readout.stop();
      void audio.generate({
        ssml,
        sourceSsml: project.ssml,
        title: project.title || copy.untitled,
        scope: "selection",
      });
    },
    [audio.generate, copy.untitled, project.ssml, project.title, readout.stop],
  );

  const replaceProject = (next: StudioDraft): void => {
    setPreviousDraft({ title: project.title, ssml: project.ssml });
    readout.stop();
    audio.cancel();
    draft.replaceDraft(next);
    setEditingSpeech(false);
    setDialog(null);
    setNotice({ text: copy.replaced, error: false });
    draft.dismissRestored();
  };

  const restorePrevious = (): void => {
    if (!previousDraft) return;
    readout.stop();
    audio.cancel();
    draft.replaceDraft(previousDraft);
    setPreviousDraft(null);
    setNotice({ text: copy.restored, error: false });
  };

  const copySsml = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable. Export the SSML instead.");
      await navigator.clipboard.writeText(project.ssml);
      setNotice({ text: copy.copied, error: false });
    } catch (error) {
      reportError(getErrorMessage(error));
    }
  };

  const exportSsml = (): void => {
    try {
      const url = URL.createObjectURL(new Blob([project.ssml], { type: "application/ssml+xml;charset=utf-8" }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = downloadName(project.title, "ssml");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      reportError(getErrorMessage(error));
    }
  };

  const generateFullAudio = (): void => {
    readout.stop();
    void audio.generate({
      ssml: project.ssml,
      sourceSsml: project.ssml,
      title: project.title || copy.untitled,
      scope: "document",
    });
  };

  const saveLabel = !draft.hydrated
    ? copy.loading
    : draft.storageError
      ? copy.saveError
      : draft.isSaving
        ? copy.saving
        : copy.saved;
  const showNotice = notice !== null || draft.restored;

  return (
    <>
      <a className="skip-link" href="#script">
        {copy.script}
      </a>
      <header className="app-bar">
        <div className="app-bar-inner">
          <div className="brand">
            <span className="brand-mark">
              <StudioIcon name="wave" />
            </span>
            <div>
              <strong>SSML Builder</strong>
              <span className="brand-subtitle">Speech Studio</span>
            </div>
          </div>
          <div className="app-preferences">
            <label className="locale-control" htmlFor="app-locale">
              <span className="sr-only">{copy.locale}</span>
              <select
                id="app-locale"
                value={locale}
                onChange={(event) => {
                  if (isStudioLocale(event.target.value)) preferences.setLocale(event.target.value);
                }}
              >
                {LOCALE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button theme-button"
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label={copy.darkMode}
              title={copy.darkMode}
              disabled={theme === null}
              onClick={preferences.toggleTheme}
            >
              <StudioIcon name={theme === "dark" ? "moon" : "sun"} />
            </button>
          </div>
        </div>
      </header>
      <main className="speech-studio">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">{copy.workspace}</p>
            <h1>{copy.heading}</h1>
            <p className="workspace-description">{copy.intro}</p>
          </div>
          <ol className="workflow" aria-label={copy.workspace}>
            {copy.steps.map((label, index) => (
              <li key={label}>
                <a href={`#${stepTargets[index]}`}>
                  <span className="workflow-number">0{index + 1}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </header>

        <section className="project-bar" aria-label={copy.projectTitle}>
          <div className="project-name">
            <StudioIcon name="file" />
            <div>
              <label className="sr-only" htmlFor="project-title">
                {copy.projectTitle}
              </label>
              <input
                id="project-title"
                value={project.title}
                maxLength={MAX_TITLE_LENGTH}
                placeholder={copy.untitled}
                disabled={!draft.hydrated}
                onChange={(event) => draft.updateTitle(event.target.value)}
              />
              <span
                className="save-status"
                role="status"
                data-error={Boolean(draft.storageError)}
                title={draft.savedAt ? new Date(draft.savedAt).toLocaleString(locale) : undefined}
              >
                <span className="status-dot" />
                {saveLabel}
              </span>
            </div>
          </div>
          <div className="project-actions">
            <button
              className="button button-subtle"
              type="button"
              disabled={!draft.hydrated}
              onClick={() => setDialog("new")}
            >
              <StudioIcon name="plus" />
              {copy.newDraft}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={!draft.hydrated}
              onClick={() => setDialog("text")}
            >
              <StudioIcon name="import" />
              {copy.importScript}
            </button>
            <button
              className="button button-accent"
              type="button"
              disabled={!draft.hydrated}
              onClick={() => setDialog("templates")}
            >
              <StudioIcon name="book" />
              {copy.templates}
            </button>
          </div>
        </section>

        {showNotice && (
          <div
            className={`workspace-notice${notice?.error ? " notice-error" : ""}`}
            role={notice?.error ? "alert" : "status"}
          >
            <span className="workspace-notice-text">
              {notice?.error ? `${copy.actionError} ${notice.text}` : (notice?.text ?? copy.restored)}
            </span>
            <div>
              {previousDraft && (
                <button type="button" className="text-button" onClick={restorePrevious}>
                  {copy.undo}
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={copy.close}
                onClick={() => {
                  setNotice(null);
                  draft.dismissRestored();
                }}
              >
                <StudioIcon name="close" />
              </button>
            </div>
          </div>
        )}
        {draft.storageError && (
          <div className="workspace-notice notice-error" role="alert">
            <div>
              <strong>{copy.saveError}</strong>
              <p>{draft.storageError}</p>
            </div>
            <button className="button button-secondary" type="button" onClick={draft.saveNow}>
              {copy.saveNow}
            </button>
          </div>
        )}
        {preferences.error && (
          <p className="inline-error" role="alert">
            {copy.actionError} {preferences.error}
          </p>
        )}

        <div className="studio-grid">
          <div className="writing-column">
            <section className="studio-panel script-panel" id="script" aria-labelledby="script-heading" tabIndex={-1}>
              <header className="script-panel-heading">
                <div className="panel-heading">
                  <span className="panel-icon">
                    <StudioIcon name="file" />
                  </span>
                  <div>
                    <p className="step-label">01</p>
                    <h2 id="script-heading">{copy.script}</h2>
                  </div>
                </div>
                <span
                  className="validation-badge"
                  data-state={hasErrors ? "error" : inspection.canSynthesize ? "ready" : "empty"}
                >
                  {inspection.canSynthesize && <StudioIcon name="check" />}
                  {validationLabel}
                </span>
              </header>
              <p className="script-guidance">{editingSpeech ? copy.scriptHint : composer.readingHint}</p>
              <div className="script-view-controls">
                <fieldset className="segmented-control">
                  <legend className="sr-only">{copy.script}</legend>
                  <button type="button" aria-pressed={!editingSpeech} onClick={() => setEditingSpeech(false)}>
                    {composer.transcript}
                  </button>
                  <button type="button" aria-pressed={editingSpeech} onClick={() => setEditingSpeech(true)}>
                    {composer.tune}
                  </button>
                </fieldset>
                {!editingSpeech && (
                  <button
                    type="button"
                    className="button button-subtle"
                    disabled={!draft.hydrated || !project.document}
                    onClick={() => setDialog("rewrite")}
                  >
                    <StudioIcon name="file" />
                    {composer.edit}
                  </button>
                )}
              </div>
              {!editingSpeech && (
                <div className={`script-transcript${inspection.text ? "" : " transcript-empty"}`}>
                  {inspection.text ? (
                    <article aria-label={copy.plainText}>
                      <p>{inspection.text}</p>
                    </article>
                  ) : (
                    <div className="transcript-empty-content">
                      <StudioIcon name="file" />
                      <p>{inspection.syntaxError ? copy.invalid : copy.empty}</p>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          if (inspection.syntaxError) setEditingSpeech(true);
                          else setDialog("text");
                        }}
                      >
                        {inspection.syntaxError ? copy.ssmlMode : copy.importScript}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="studio-editor-host" hidden={!editingSpeech}>
                <StudioEditor
                  document={project.document}
                  ssml={project.ssml}
                  locale={locale}
                  theme={theme}
                  implementation={implementation}
                  ready={draft.hydrated}
                  copy={copy}
                  onDocumentChange={draft.updateDocument}
                  onSsmlChange={draft.updateSsml}
                  onPreview={audio.configuration === "configured" && !audio.generating ? previewPassage : undefined}
                  previewUnavailableReason={previewUnavailableReason}
                  onError={reportError}
                />
              </div>
              <footer className="script-footer">
                <div className="script-stats">
                  <span>
                    <strong>{inspection.characters.toLocaleString(locale)}</strong> {copy.characters}
                  </span>
                  <span>
                    <strong>{inspection.paragraphs}</strong> {copy.paragraphs}
                  </span>
                </div>
                <span className="duration-estimate" title={copy.estimatedHint}>
                  {copy.estimated} <strong>{inspection.estimatedSeconds || "—"}</strong> {copy.seconds}
                </span>
              </footer>
              {(inspection.syntaxError || inspection.diagnostics.length > 0) && (
                <details className="validation-details" open={hasErrors}>
                  <summary>
                    {hasErrors ? copy.invalid : copy.warnings}{" "}
                    <span>{inspection.syntaxError ? 1 : inspection.diagnostics.length}</span>
                  </summary>
                  <p className="panel-note">{copy.validationHint}</p>
                  <ul className="diagnostic-list">
                    {inspection.syntaxError && (
                      <li className="diagnostic-error">
                        {inspection.syntaxError.line}:{inspection.syntaxError.column} · {inspection.syntaxError.message}
                      </li>
                    )}
                    {inspection.diagnostics.map((item) => (
                      <li key={`${item.line}:${item.column}:${item.message}`} className={`diagnostic-${item.severity}`}>
                        {item.line}:{item.column} · {item.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {warnings.length > 0 && !hasErrors && (
                <span className="sr-only">
                  {copy.warnings}: {warnings.length}
                </span>
              )}
            </section>

            <section className="studio-panel source-panel" aria-labelledby="source-heading">
              <header className="source-heading">
                <h2 id="source-heading">
                  <StudioIcon name="code" />
                  {copy.generatedSsml}
                </h2>
                <div className="source-actions">
                  <button
                    className="button button-subtle"
                    type="button"
                    disabled={!draft.hydrated}
                    onClick={() => void copySsml()}
                  >
                    <StudioIcon name="copy" />
                    {copy.copy}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={!draft.hydrated}
                    onClick={exportSsml}
                  >
                    <StudioIcon name="download" />
                    {copy.download}
                  </button>
                </div>
              </header>
              <details className="source-preview">
                <summary>SSML / {copy.plainText}</summary>
                <fieldset className="segmented-control">
                  <legend className="sr-only">{copy.generatedSsml}</legend>
                  <button type="button" aria-pressed={sourceTab === "ssml"} onClick={() => setSourceTab("ssml")}>
                    SSML
                  </button>
                  <button type="button" aria-pressed={sourceTab === "text"} onClick={() => setSourceTab("text")}>
                    {copy.plainText}
                  </button>
                </fieldset>
                <pre>
                  <code>{sourceTab === "ssml" ? project.ssml : inspection.text}</code>
                </pre>
              </details>
            </section>
            <DeveloperTools
              copy={copy}
              implementation={implementation}
              onImplementationChange={setImplementation}
              ssml={project.ssml}
              disabled={!draft.hydrated || Boolean(inspection.syntaxError)}
              onApply={(ssml) => replaceProject({ title: project.title, ssml })}
            />
          </div>
          <aside className="production-column" aria-label={copy.voiceSettings}>
            <VoicePanel
              document={project.document}
              ready={draft.hydrated}
              copy={copy}
              onChange={draft.updateDocument}
              onError={reportError}
            />
            <PreviewPanel
              copy={copy}
              audio={audio}
              readout={readout}
              ssml={project.ssml}
              canSynthesize={draft.hydrated && inspection.canSynthesize}
              canRead={draft.hydrated && inspection.characters > 0}
              onGenerate={generateFullAudio}
              onRead={() => readout.speak(inspection.text, project.document?.lang ?? "ja-JP")}
            />
          </aside>
        </div>
        <footer className="studio-footer">
          <StudioIcon name="check" />
          <p>{copy.localOnly}</p>
          <span className="studio-signature">SSML Builder · Azure Speech</span>
        </footer>
      </main>
      {dialog && (
        <ProjectDialog
          mode={dialog}
          project={project}
          locale={locale}
          copy={copy}
          onApply={replaceProject}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
