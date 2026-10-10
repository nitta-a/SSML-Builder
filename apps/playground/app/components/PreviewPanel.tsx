import { downloadName } from "../studio";
import type { StudioCopy } from "../studioCopy";
import type { useAudioPreview } from "../hooks/useAudioPreview";
import type { useBrowserReadout } from "../hooks/useBrowserReadout";
import { StudioIcon } from "./StudioIcon";

interface PreviewPanelProps {
  copy: StudioCopy;
  audio: ReturnType<typeof useAudioPreview>;
  readout: ReturnType<typeof useBrowserReadout>;
  ssml: string;
  canSynthesize: boolean;
  canRead: boolean;
  onGenerate: () => void;
  onRead: () => void;
}

export function PreviewPanel({
  copy,
  audio,
  readout,
  ssml,
  canSynthesize,
  canRead,
  onGenerate,
  onRead,
}: PreviewPanelProps) {
  const statusLabels = {
    checking: copy.azureChecking,
    configured: copy.azureReady,
    missing: copy.azureMissing,
    error: copy.azureError,
  };
  const result = audio.result;
  const stale = result !== null && result.sourceSsml !== ssml;
  const scope = result?.scope === "selection" ? copy.partialAudio : copy.fullAudio;

  return (
    <section className="studio-panel preview-panel" id="preview" aria-labelledby="preview-heading">
      <header className="panel-heading">
        <span className="panel-icon">
          <StudioIcon name="play" />
        </span>
        <div>
          <p className="step-label">03</p>
          <h2 id="preview-heading">{copy.preview}</h2>
        </div>
      </header>
      <p className="panel-note">{copy.previewHint}</p>
      <div className="azure-status" data-status={audio.configuration} role="status">
        <span className="status-dot" />
        <span>{statusLabels[audio.configuration]}</span>
      </div>
      {audio.configuration === "missing" && (
        <details className="setup-guide">
          <summary>
            {copy.azureMissing} <StudioIcon name="code" />
          </summary>
          <p>{copy.azureSetup}</p>
        </details>
      )}
      {audio.configuration === "error" && (
        <div className="inline-error" role="alert">
          <p>{audio.configurationError}</p>
          <button type="button" className="button button-subtle" onClick={() => void audio.checkConfiguration()}>
            {copy.retry}
          </button>
        </div>
      )}
      <button
        type="button"
        className="button button-primary generate-button"
        onClick={onGenerate}
        disabled={!canSynthesize || audio.configuration !== "configured" || audio.generating}
        aria-busy={audio.generating}
      >
        <StudioIcon name="play" />
        {audio.generating ? copy.generating : copy.generate}
      </button>
      {audio.generating && (
        <button className="button button-subtle" type="button" onClick={audio.cancel}>
          {copy.cancel}
        </button>
      )}
      {audio.error && (
        <p className="inline-error" role="alert">
          {audio.error}
        </p>
      )}
      {result ? (
        <div className="audio-result">
          <p className="sr-only" role="status">
            {copy.audioReady}
          </p>
          <div className="audio-result-heading">
            <StudioIcon name="wave" />
            <div>
              <strong>{result.title || copy.untitled}</strong>
              <span className="audio-scope">{scope}</span>
            </div>
          </div>
          {stale && (
            <p className="stale-notice" role="status">
              {copy.audioStale}
            </p>
          )}
          <audio key={result.url} controls autoPlay src={result.url} aria-label={scope}>
            <track kind="captions" label={copy.plainText} src={result.captionTrack} srcLang={result.language} default />
          </audio>
          <a
            className="button button-secondary"
            href={result.url}
            download={downloadName(result.scope === "selection" ? `${result.title}-selection` : result.title, "mp3")}
          >
            <StudioIcon name="download" />
            {copy.downloadAudio}
          </a>
        </div>
      ) : (
        <div className="audio-empty">
          <div className="empty-wave" aria-hidden="true">
            <StudioIcon name="wave" />
          </div>
          <p>{copy.audioEmpty}</p>
        </div>
      )}
      <div className="browser-review">
        <button
          type="button"
          className="button button-secondary"
          onClick={readout.speaking ? readout.stop : onRead}
          disabled={!readout.supported || !canRead || audio.generating}
          aria-pressed={readout.speaking}
        >
          <StudioIcon name={readout.speaking ? "stop" : "speaker"} />
          {readout.speaking ? copy.stop : copy.browserPreview}
        </button>
        <p className="panel-note">{readout.supported ? copy.browserHint : copy.browserUnavailable}</p>
        {readout.error && (
          <p className="inline-error" role="alert">
            {copy.browserError} {readout.error}
          </p>
        )}
      </div>
    </section>
  );
}
