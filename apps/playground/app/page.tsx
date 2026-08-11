"use client";

import { useEffect, useRef, useState } from "react";
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";
import type { SsmlNode } from "@ssml-builder/ssml-core";
import { SsmlEditor } from "@ssml-builder/ssml-editor-react";
import type { SsmlEditorRef } from "@ssml-builder/ssml-editor-react";

type SpeechLanguage = "ja-JP" | "en-US";
type SpeechGender = "female" | "male";
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

const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (en-US)" },
  { value: "ja-JP", label: "日本語 (ja-JP)" },
] as const;

const GENDER_OPTIONS = [
  { value: "female", label: "Female (女性)" },
  { value: "male", label: "Male (男性)" },
] as const;

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

function createCaptionTrack(document: SsmlDocument): string {
  const text =
    getDocumentChildren(document).map(getNodeText).join("").trim().replace(/\s+/g, " ").replaceAll("-->", "-- >") ||
    "Generated speech";
  const webVtt = `WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n${text}`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(webVtt)}`;
}

function createCaptionTrackFromSsml(ssml: string, fallbackDocument: SsmlDocument): string {
  try {
    return createCaptionTrack(parseSsml(ssml));
  } catch {
    return createCaptionTrack(fallbackDocument);
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

async function getSynthesisError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {}

  return `Audio generation failed (${response.status}).`;
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
  const ssml = buildSsml(document);
  const selectedVoice = VOICE_NAMES[selectedLanguage][selectedGender];
  const currentCaptionTrack = createCaptionTrack(document);
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
        throw new Error(await getSynthesisError(response));
      }

      const audioBlob = await response.blob();
      setAudioCaptionTrack(requestCaptionTrack);
      setAudioCaptionLanguage(requestCaptionLanguage);
      replaceAudioUrl(URL.createObjectURL(audioBlob));
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Audio generation failed.");
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

    void synthesizeAudio(selectedSsml, createCaptionTrackFromSsml(selectedSsml, document), document.lang);
  };

  return (
    <main className="playground">
      <header className="intro">
        <div className="intro-heading">
          <div>
            <p className="eyebrow">SSML Builder</p>
            <h1>Playground</h1>
          </div>
          <div className="theme-switch">
            <span id="theme-switch-label">Dark mode</span>
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
        <p>Edit the sample document below to verify the SSML editor and core package together.</p>
      </header>
      <section className="speech-settings" aria-labelledby="speech-settings-heading">
        <h2 id="speech-settings-heading">Speech settings</h2>
        <div className="settings-fields">
          <label className="setting-field" htmlFor="speech-language">
            <span>Language</span>
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
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-field" htmlFor="speech-gender">
            <span>Gender</span>
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
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="selected-voice">
          Voice: <code>{selectedVoice}</code>
        </p>
      </section>
      <SsmlEditor
        ref={editorRef}
        document={document}
        onChange={setDocument}
        onPreviewSelection={previewSelectedAudio}
        language="ja"
        theme={theme ?? "system"}
      />
      <section className="audio-generation" aria-labelledby="audio-generation-heading">
        <h2 id="audio-generation-heading">Audio preview</h2>
        <p>Generate audio from the current SSML and listen to it in the browser.</p>
        <button
          className="generate-audio"
          type="button"
          onClick={generateAudio}
          disabled={isGeneratingAudio}
          aria-busy={isGeneratingAudio}
        >
          {isGeneratingAudio ? "Generating audio..." : "Generate audio"}
        </button>
        {audioError ? (
          <p className="audio-error" role="alert">
            {audioError}
          </p>
        ) : null}
        {audioUrl ? (
          <audio className="audio-player" controls autoPlay src={audioUrl} aria-label="Generated speech audio">
            <track kind="captions" label="SSML text" src={captionTrackSource} srcLang={captionLanguage} default />
            Your browser does not support audio playback.
          </audio>
        ) : null}
      </section>
      <section className="output" aria-labelledby="generated-ssml-heading">
        <h2 id="generated-ssml-heading">Generated SSML</h2>
        <pre>
          <code>{ssml}</code>
        </pre>
      </section>
    </main>
  );
}
