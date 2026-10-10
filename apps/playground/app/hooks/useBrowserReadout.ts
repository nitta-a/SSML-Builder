import { useCallback, useEffect, useRef, useState } from "react";
import { areAzureLanguagesEquivalent } from "@ssml-builder-js/ssml-core";
import { getErrorMessage } from "../studio";

export function useBrowserReadout(sourceSsml: string) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingSourceRef = useRef(sourceSsml);

  const stop = useCallback((): void => {
    if (!utteranceRef.current) return;
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (utteranceRef.current) {
        utteranceRef.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (speakingSourceRef.current !== sourceSsml) stop();
    speakingSourceRef.current = sourceSsml;
  }, [sourceSsml, stop]);

  const speak = useCallback(
    (text: string, language: string): void => {
      stop();
      setError(null);
      try {
        if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
          throw new Error("Browser speech is not supported.");
        }
        if (!text.trim()) throw new Error("The script is empty.");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        const voice = window.speechSynthesis
          .getVoices()
          .find((voice) => areAzureLanguagesEquivalent(language, voice.lang));
        if (voice) utterance.voice = voice;
        utterance.onend = () => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          setSpeaking(false);
        };
        utterance.onerror = (event) => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          setSpeaking(false);
          setError(event.error);
        };
        utteranceRef.current = utterance;
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        utteranceRef.current = null;
        setSpeaking(false);
        setError(getErrorMessage(error));
      }
    },
    [stop],
  );

  return { supported, speaking, error, speak, stop };
}
