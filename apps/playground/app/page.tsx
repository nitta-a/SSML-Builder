"use client";

import { useState } from "react";
import { useEffect } from "react";
import { buildSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";
import type { SsmlNode } from "@ssml-builder/ssml-core";
import { SsmlEditor } from "@ssml-builder/ssml-editor-react";

type SpeechLanguage = "ja-JP" | "en-US";
type SpeechGender = "female" | "male";

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
          pitch: "0st",
          volume: "medium",
          children: ["Welcome to the SSML Builder playground."],
        },
      ],
    },
  ],
};

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return (
    document.children ??
    (document.content === undefined ? [] : [document.content])
  );
}

function updateFirstVoice(
  nodes: SsmlNode[],
  voiceName: string,
): { nodes: SsmlNode[]; updated: boolean } {
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

function updateSpeechSettings(
  document: SsmlDocument,
  language: SpeechLanguage,
  gender: SpeechGender,
): SsmlDocument {
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
    if (
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Use the status-based fallback when the response is not JSON.
  }

  return `Audio generation failed (${response.status}).`;
}

export default function Home() {
  const [document, setDocument] = useState<SsmlDocument>(initialDocument);
  const [selectedLanguage, setSelectedLanguage] =
    useState<SpeechLanguage>("en-US");
  const [selectedGender, setSelectedGender] = useState<SpeechGender>("female");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const ssml = buildSsml(document);
  const selectedVoice = VOICE_NAMES[selectedLanguage][selectedGender];

  useEffect(() => {
    if (!audioUrl) {
      return;
    }

    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const generateAudio = async (): Promise<void> => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    setAudioUrl(null);

    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ssml }),
      });

      if (!response.ok) {
        throw new Error(await getSynthesisError(response));
      }

      const audioBlob = await response.blob();
      setAudioUrl(URL.createObjectURL(audioBlob));
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Audio generation failed.",
      );
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  return (
    <main className="playground">
      <header className="intro">
        <p className="eyebrow">SSML Builder</p>
        <h1>Playground</h1>
        <p>
          Edit the sample document below to verify the SSML editor and core
          package together.
        </p>
      </header>
      <section
        className="speech-settings"
        aria-labelledby="speech-settings-heading"
      >
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
                setDocument((currentDocument) =>
                  updateSpeechSettings(
                    currentDocument,
                    language,
                    selectedGender,
                  ),
                );
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
                setDocument((currentDocument) =>
                  updateSpeechSettings(
                    currentDocument,
                    selectedLanguage,
                    gender,
                  ),
                );
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
      <SsmlEditor document={document} onChange={setDocument} language="ja" />
      <section
        className="audio-generation"
        aria-labelledby="audio-generation-heading"
      >
        <h2 id="audio-generation-heading">Audio preview</h2>
        <p>
          Generate audio from the current SSML and listen to it in the browser.
        </p>
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
          <audio
            className="audio-player"
            controls
            autoPlay
            src={audioUrl}
            aria-label="Generated speech audio"
          >
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
