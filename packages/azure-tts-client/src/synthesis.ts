import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechSdkError } from "./errors.ts";
import { createSpeechConfig } from "./speechConfig.ts";
import type { SsmlSynthesisResult, TtsConfig } from "./types.ts";

function closeSpeechResources(speechConfig: SpeechSDK.SpeechConfig, synthesizer: SpeechSDK.SpeechSynthesizer): void {
  try {
    synthesizer.close();
  } catch {}

  try {
    speechConfig.close();
  } catch {}
}

const ticksToMilliseconds = (ticks: number): number => Math.max(0, ticks) / 10_000;

export async function synthesizeSsml(ssml: string, config: TtsConfig): Promise<SsmlSynthesisResult> {
  if (config.signal?.aborted) {
    throw createSpeechSdkError("Speech synthesis was cancelled.");
  }

  const speechConfig = createSpeechConfig(config);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

  return await new Promise<SsmlSynthesisResult>((resolve, reject) => {
    let resourcesClosed = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (abortHandler) config.signal?.removeEventListener("abort", abortHandler);
    };
    const closeResources = () => {
      if (resourcesClosed) return;
      resourcesClosed = true;
      closeSpeechResources(speechConfig, synthesizer);
    };
    const rejectWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeResources();
      reject(createSpeechSdkError(error));
    };

    const boundaries: SsmlSynthesisResult["boundaries"] = [];
    const visemes: SsmlSynthesisResult["visemes"] = [];
    const bookmarks: SsmlSynthesisResult["bookmarks"] = [];
    synthesizer.wordBoundary = (_sender, event) => {
      boundaries.push({
        text: event.text,
        audioOffsetMs: ticksToMilliseconds(event.audioOffset),
        durationMs: ticksToMilliseconds(event.duration),
      });
    };
    synthesizer.visemeReceived = (_sender, event) => {
      visemes.push({ visemeId: event.visemeId, audioOffsetMs: ticksToMilliseconds(event.audioOffset) });
    };
    synthesizer.bookmarkReached = (_sender, event) => {
      bookmarks.push({ name: event.text, audioOffsetMs: ticksToMilliseconds(event.audioOffset) });
    };

    const cb = (result: SpeechSDK.SpeechSynthesisResult) => {
      if (settled) return;
      const { reason, errorDetails } = result;
      if (reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        const err = errorDetails || `Speech synthesis failed with reason ${reason}.`;
        rejectWithError(err);
        return;
      }
      settled = true;
      cleanup();
      closeResources();
      const eventDurationMs = Math.max(
        0,
        ...(boundaries ?? []).map((boundary) => boundary.audioOffsetMs + boundary.durationMs),
        ...(visemes ?? []).map((viseme) => viseme.audioOffsetMs),
        ...(bookmarks ?? []).map((bookmark) => bookmark.audioOffsetMs),
      );
      const durationMs = result.audioDuration ? ticksToMilliseconds(result.audioDuration) : eventDurationMs;
      resolve({
        audioData: result.audioData,
        durationMs,
        ...(boundaries.length > 0 ? { boundaries, wordBoundary: boundaries, wordBoundaries: boundaries } : {}),
        ...(visemes.length > 0 ? { visemes } : {}),
        ...(bookmarks.length > 0 ? { bookmarks } : {}),
      });
    };

    try {
      if (config.signal) {
        abortHandler = () => rejectWithError("Speech synthesis was cancelled.");
        config.signal.addEventListener("abort", abortHandler, { once: true });
      }
      if (config.timeoutMs !== undefined && config.timeoutMs > 0) {
        timeout = setTimeout(
          () => rejectWithError(`Speech synthesis timed out after ${config.timeoutMs} ms.`),
          config.timeoutMs,
        );
      }
      synthesizer.speakSsmlAsync(ssml, cb, rejectWithError);
    } catch (error) {
      rejectWithError(error);
    }
  });
}

/** Backward-compatible audio-only synthesis helper. */
export async function synthesizeSpeech(ssml: string, config: TtsConfig): Promise<ArrayBuffer> {
  return (await synthesizeSsml(ssml, config)).audioData;
}
