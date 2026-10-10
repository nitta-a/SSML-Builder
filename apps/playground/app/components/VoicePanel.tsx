import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import {
  getDefaultVoice,
  getPrimaryProsody,
  getPrimaryVoice,
  getSpeechLanguage,
  SPEECH_LANGUAGES,
  updateProsody,
  updateVoice,
  VOICE_OPTIONS,
} from "../studio";
import type { ProsodySetting } from "../studio";
import type { StudioCopy } from "../studioCopy";
import { StudioIcon } from "./StudioIcon";

interface VoicePanelProps {
  document: SsmlDocument | null;
  copy: StudioCopy;
  ready: boolean;
  onChange: (document: SsmlDocument) => void;
  onError: (message: string) => void;
}

export function VoicePanel({ document, copy, ready, onChange, onError }: VoicePanelProps) {
  const primaryVoice = document ? getPrimaryVoice(document) : undefined;
  const voiceName = primaryVoice?.name ?? "";
  const language = document ? (getSpeechLanguage(document.lang) ?? document.lang) : "ja-JP";
  const voices = VOICE_OPTIONS.filter((voice) => voice.language === language);
  const prosody = document ? getPrimaryProsody(document) : undefined;
  const currentVoice = VOICE_OPTIONS.find((voice) => voice.name === voiceName);
  const fields: readonly { setting: ProsodySetting; label: string; value: string; options: readonly string[] }[] = [
    {
      setting: "rate",
      label: copy.rate,
      value: String(prosody?.rate ?? "medium"),
      options: ["x-slow", "slow", "medium", "fast", "x-fast"],
    },
    {
      setting: "pitch",
      label: copy.pitch,
      value: String(prosody?.pitch ?? "0st"),
      options: ["-4st", "-2st", "0st", "+2st", "+4st"],
    },
    {
      setting: "volume",
      label: copy.volume,
      value: String(prosody?.volume ?? "medium"),
      options: ["soft", "medium", "loud"],
    },
  ];
  const optionLabel = (setting: ProsodySetting, value: string): string => {
    if (value === "medium" || value === "0st") return copy.standard;
    if (value === "slow") return copy.slow;
    if (value === "fast") return copy.fast;
    if (value === "soft") return copy.soft;
    if (value === "loud") return copy.loud;
    if (setting === "pitch" && /^[+-]?\d+st$/.test(value)) return value;
    return value;
  };

  return (
    <section className="studio-panel voice-panel" id="voice" aria-labelledby="voice-heading">
      <header className="panel-heading">
        <span className="panel-icon">
          <StudioIcon name="speaker" />
        </span>
        <div>
          <p className="step-label">02</p>
          <h2 id="voice-heading">{copy.voiceSettings}</h2>
        </div>
      </header>
      <fieldset className="voice-fields" disabled={!ready || !document}>
        <legend className="sr-only">{copy.voiceSettings}</legend>
        <label className="field" htmlFor="speech-language">
          <span>{copy.language}</span>
          <select
            id="speech-language"
            value={language}
            onChange={(event) => {
              const selected = SPEECH_LANGUAGES.find((option) => option.value === event.target.value);
              if (!document || !selected) {
                onError(copy.actionError);
                return;
              }
              const voice = getDefaultVoice(selected.value, currentVoice?.gender);
              onChange(updateVoice(document, voice, selected.value));
            }}
          >
            {!SPEECH_LANGUAGES.some((option) => option.value === language) && (
              <option value={language}>{language}</option>
            )}
            {SPEECH_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.prefix}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="speech-voice">
          <span>{copy.voice}</span>
          <select
            id="speech-voice"
            value={voiceName}
            onChange={(event) => {
              if (!document) {
                onError(copy.actionError);
                return;
              }
              onChange(updateVoice(document, event.target.value));
            }}
          >
            {!voices.some((voice) => voice.name === voiceName) && (
              <option value={voiceName}>{voiceName || copy.standard}</option>
            )}
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.displayName} · {voice.gender === "female" ? copy.female : copy.male}
              </option>
            ))}
          </select>
          {voiceName && <code className="voice-name">{voiceName}</code>}
        </label>
        <div className="voice-divider" />
        {fields.map((field) => (
          <label className="field field-inline" key={field.setting} htmlFor={`speech-${field.setting}`}>
            <span>{field.label}</span>
            <select
              id={`speech-${field.setting}`}
              value={field.value}
              onChange={(event) => {
                if (!document) {
                  onError(copy.actionError);
                  return;
                }
                onChange(updateProsody(document, field.setting, event.target.value));
              }}
            >
              {!field.options.includes(field.value) && <option value={field.value}>{field.value}</option>}
              {field.options.map((value) => (
                <option key={value} value={value}>
                  {optionLabel(field.setting, value)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <p className="panel-note">{copy.voiceHint}</p>
    </section>
  );
}
