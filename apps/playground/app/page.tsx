"use client";

import { useEffect, useRef, useState } from "react";
import { buildSsml, parseSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import type { SsmlNode } from "@ssml-builder-js/ssml-core";
import { SsmlEditor } from "@ssml-builder-js/ssml-editor-react";
import type { SsmlEditorRef } from "@ssml-builder-js/ssml-editor-react";

type SpeechLanguage = "ja-JP" | "en-US";
type SpeechGender = "female" | "male";
type PlaygroundLocale = "ja" | "en";
type PlaygroundTheme = "light" | "dark";

const THEME_STORAGE_KEY = "ssml-builder-playground-theme";

const VOICE_NAMES = {
  "ja-JP": {
    female: "ja-JP-NanamiNeural",
    male: "ja-JP-KeitaNeural",
  },
  "en-US": {
    female: "en-US-JennyNeural",
    male: "en-US-GuyNeural",
  },
} satisfies Record<SpeechLanguage, Record<SpeechGender, string>>;

const LOCALE_OPTIONS = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
] as const satisfies ReadonlyArray<{ value: PlaygroundLocale; label: string }>;

const GENDER_OPTIONS = [
  { value: "female", labels: { ja: "女性", en: "Female" } },
  { value: "male", labels: { ja: "男性", en: "Male" } },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en-US", labels: { ja: "英語 (en-US)", en: "English (en-US)" } },
  { value: "ja-JP", labels: { ja: "日本語 (ja-JP)", en: "Japanese (ja-JP)" } },
] as const;

type PlaygroundCopy = {
  localeLabel: string;
  playgroundTitle: string;
  themeLabel: string;
  introDescription: string;
  speechSettings: string;
  speechLanguage: string;
  speechGender: string;
  voice: string;
  audioPreview: string;
  audioDescription: string;
  generateAudio: string;
  generatingAudio: string;
  generatedAudio: string;
  generatedSsml: string;
  ssmlTextTrack: string;
  unsupportedAudio: string;
  generatedSpeechFallback: string;
  audioError: (status: number) => string;
  synthesisError: string;
};

const PLAYGROUND_COPY: Readonly<Record<PlaygroundLocale, PlaygroundCopy>> = {
  ja: {
    localeLabel: "表示言語",
    playgroundTitle: "Playground",
    themeLabel: "ダークモード",
    introDescription: "以下のサンプルドキュメントを編集して、SSML エディターとコアパッケージを確認できます。",
    speechSettings: "音声設定",
    speechLanguage: "音声言語",
    speechGender: "性別",
    voice: "音声",
    audioPreview: "音声プレビュー",
    audioDescription: "現在の SSML から音声を生成して、ブラウザーで再生できます。",
    generateAudio: "音声を生成",
    generatingAudio: "音声を生成中...",
    generatedAudio: "生成された音声",
    generatedSsml: "生成された SSML",
    ssmlTextTrack: "SSML テキスト",
    unsupportedAudio: "お使いのブラウザーは音声再生に対応していません。",
    generatedSpeechFallback: "生成された音声",
    audioError: (status) => `音声の生成に失敗しました (${status})。`,
    synthesisError: "音声の生成に失敗しました。",
  },
  en: {
    localeLabel: "Display language",
    playgroundTitle: "Playground",
    themeLabel: "Dark mode",
    introDescription: "Edit the sample document below to verify the SSML editor and core package together.",
    speechSettings: "Speech settings",
    speechLanguage: "Language",
    speechGender: "Gender",
    voice: "Voice",
    audioPreview: "Audio preview",
    audioDescription: "Generate audio from the current SSML and listen to it in the browser.",
    generateAudio: "Generate audio",
    generatingAudio: "Generating audio...",
    generatedAudio: "Generated speech audio",
    generatedSsml: "Generated SSML",
    ssmlTextTrack: "SSML text",
    unsupportedAudio: "Your browser does not support audio playback.",
    generatedSpeechFallback: "Generated speech",
    audioError: (status) => `Audio generation failed (${status}).`,
    synthesisError: "Audio generation failed.",
  },
};

const initialDocument: SsmlDocument = {
  type: "speak",
  version: "1.0",
  lang: "en-US",
  children: [
    {
      type: "voice",
      name: "en-US-JennyNeural",
      children: [
        {
          type: "prosody",
          rate: "medium",
          volume: "medium",
          children: ["Welcome to the SSML Builder playground."],
        },
      ],
    },
  ],
};

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function getNodeText(node: SsmlNode): string {
  if (typeof node === "string") {
    return node;
  }

  if (node.type === "text") {
    return node.value;
  }

  return (node.children ?? []).map(getNodeText).join("");
}

function createCaptionTrack(document: SsmlDocument, fallbackText: string): string {
  const text =
    getDocumentChildren(document).map(getNodeText).join("").trim().replace(/\s+/g, " ").replaceAll("-->", "-- >") ||
    fallbackText;
  const webVtt = `WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n${text}`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(webVtt)}`;
}

function createCaptionTrackFromSsml(ssml: string, fallbackDocument: SsmlDocument, fallbackText: string): string {
  try {
    return createCaptionTrack(parseSsml(ssml), fallbackText);
  } catch {
    return createCaptionTrack(fallbackDocument, fallbackText);
  }
}

function updateFirstVoice(nodes: SsmlNode[], voiceName: string): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || typeof node === "string" || node.type === "text") {
      return node;
    }

    if (node.type === "voice") {
      updated = true;
      return { ...node, name: voiceName };
    }

    if (node.children) {
      const result = updateFirstVoice(node.children, voiceName);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function updateSpeechSettings(document: SsmlDocument, language: SpeechLanguage, gender: SpeechGender): SsmlDocument {
  const voiceName = VOICE_NAMES[language][gender];
  const children = getDocumentChildren(document);
  const voiceResult = updateFirstVoice(children, voiceName);
  const nextChildren = voiceResult.updated
    ? voiceResult.nodes
    : [
        {
          type: "voice" as const,
          name: voiceName,
          children: children.length > 0 ? children : [""],
        },
      ];
  const nextDocument: SsmlDocument = {
    ...document,
    lang: language,
    children: nextChildren,
  };

  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }

  return nextDocument;
}

async function getSynthesisError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {}

  return fallbackMessage;
}

function getStoredTheme(): PlaygroundTheme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: PlaygroundTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

export default function Home() {
  const [document, setDocument] = useState<SsmlDocument>(initialDocument);
  const [locale, setLocale] = useState<PlaygroundLocale>("ja");
  const [selectedLanguage, setSelectedLanguage] = useState<SpeechLanguage>("en-US");
  const [selectedGender, setSelectedGender] = useState<SpeechGender>("female");
  const [theme, setTheme] = useState<PlaygroundTheme | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioCaptionTrack, setAudioCaptionTrack] = useState<string | null>(null);
  const [audioCaptionLanguage, setAudioCaptionLanguage] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const editorRef = useRef<SsmlEditorRef>(null);
  const hasManualThemeRef = useRef(false);
  const copy = PLAYGROUND_COPY[locale];
  const ssml = buildSsml(document);
  const selectedVoice = VOICE_NAMES[selectedLanguage][selectedGender];
  const currentCaptionTrack = createCaptionTrack(document, copy.generatedSpeechFallback);
  const captionTrackSource = audioCaptionTrack ?? currentCaptionTrack;
  const captionLanguage = audioCaptionLanguage ?? document.lang;

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    if (storedTheme !== null) {
      hasManualThemeRef.current = true;
      setTheme(storedTheme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = (isDark: boolean): void => {
      if (!hasManualThemeRef.current) {
        setTheme(isDark ? "dark" : "light");
      }
    };
    const handleChange = (event: MediaQueryListEvent): void => updateTheme(event.matches);

    updateTheme(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (theme === null) {
      return;
    }

    if (!hasManualThemeRef.current) {
      globalThis.document.documentElement.removeAttribute("data-theme");
      return;
    }

    globalThis.document.documentElement.dataset.theme = theme;
  }, [theme]);

  const replaceAudioUrl = (nextAudioUrl: string | null): void => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
  };

  const toggleTheme = (): void => {
    if (theme === null) {
      return;
    }

    hasManualThemeRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    storeTheme(nextTheme);
  };

  const synthesizeAudio = async (
    requestSsml: string,
    requestCaptionTrack: string,
    requestCaptionLanguage: string,
  ): Promise<void> => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    setAudioCaptionTrack(null);
    setAudioCaptionLanguage(null);
    replaceAudioUrl(null);

    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ssml: requestSsml }),
      });

      if (!response.ok) {
        throw new Error(await getSynthesisError(response, copy.audioError(response.status)));
      }

      const audioBlob = await response.blob();
      setAudioCaptionTrack(requestCaptionTrack);
      setAudioCaptionLanguage(requestCaptionLanguage);
      replaceAudioUrl(URL.createObjectURL(audioBlob));
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : copy.synthesisError);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const generateAudio = (): void => {
    void synthesizeAudio(ssml, currentCaptionTrack, document.lang);
  };

  const previewSelectedAudio = (): void => {
    const selectedSsml = editorRef.current?.getSelectedSsml();
    if (!selectedSsml) {
      return;
    }

    void synthesizeAudio(
      selectedSsml,
      createCaptionTrackFromSsml(selectedSsml, document, copy.generatedSpeechFallback),
      document.lang,
    );
  };

  return (
    <main className="playground">
      <header className="intro">
        <div className="intro-heading">
          <div className="intro-title">
            <p className="eyebrow">SSML Builder</p>
            <h1>{copy.playgroundTitle}</h1>
          </div>
          <div className="intro-actions">
            <label className="locale-field" htmlFor="app-locale">
              <span>{copy.localeLabel}</span>
              <select
                id="app-locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value as PlaygroundLocale)}
              >
                {LOCALE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="theme-switch">
              <span id="theme-switch-label">{copy.themeLabel}</span>
              <button
                className="theme-switch-track"
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-labelledby="theme-switch-label"
                onClick={toggleTheme}
                disabled={theme === null}
              >
                <span className="theme-switch-thumb" />
              </button>
            </div>
          </div>
        </div>
        <p>{copy.introDescription}</p>
      </header>
      <section className="speech-settings" aria-labelledby="speech-settings-heading">
        <h2 id="speech-settings-heading">{copy.speechSettings}</h2>
        <div className="settings-fields">
          <label className="setting-field" htmlFor="speech-language">
            <span>{copy.speechLanguage}</span>
            <select
              id="speech-language"
              value={selectedLanguage}
              onChange={(event) => {
                const language = event.target.value as SpeechLanguage;
                setSelectedLanguage(language);
                setDocument((currentDocument) => updateSpeechSettings(currentDocument, language, selectedGender));
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labels[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-field" htmlFor="speech-gender">
            <span>{copy.speechGender}</span>
            <select
              id="speech-gender"
              value={selectedGender}
              onChange={(event) => {
                const gender = event.target.value as SpeechGender;
                setSelectedGender(gender);
                setDocument((currentDocument) => updateSpeechSettings(currentDocument, selectedLanguage, gender));
              }}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labels[locale]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="selected-voice">
          {copy.voice}: <code>{selectedVoice}</code>
        </p>
      </section>
      <SsmlEditor
        ref={editorRef}
        document={document}
        onChange={setDocument}
        onPreviewSelection={previewSelectedAudio}
        locale={locale}
        theme={theme ?? "system"}
      />
      <section className="audio-generation" aria-labelledby="audio-generation-heading">
        <h2 id="audio-generation-heading">{copy.audioPreview}</h2>
        <p>{copy.audioDescription}</p>
        <button
          className="generate-audio"
          type="button"
          onClick={generateAudio}
          disabled={isGeneratingAudio}
          aria-busy={isGeneratingAudio}
        >
          {isGeneratingAudio ? copy.generatingAudio : copy.generateAudio}
        </button>
        {audioError ? (
          <p className="audio-error" role="alert">
            {audioError}
          </p>
        ) : null}
        {audioUrl ? (
          <audio className="audio-player" controls autoPlay src={audioUrl} aria-label={copy.generatedAudio}>
            <track
              kind="captions"
              label={copy.ssmlTextTrack}
              src={captionTrackSource}
              srcLang={captionLanguage}
              default
            />
            {copy.unsupportedAudio}
          </audio>
        ) : null}
      </section>
      <section className="output" aria-labelledby="generated-ssml-heading">
        <h2 id="generated-ssml-heading">{copy.generatedSsml}</h2>
        <pre>
          <code>{ssml}</code>
        </pre>
      </section>
    </main>
  );
}
