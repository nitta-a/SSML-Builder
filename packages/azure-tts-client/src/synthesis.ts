import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechSdkError } from "./errors.ts";
import { createSpeechConfig } from "./speechConfig.ts";
import type { SsmlSynthesisChunk, SsmlSynthesisResult, TtsConfig } from "./types.ts";

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
      const requestId = (result as SpeechSDK.SpeechSynthesisResult & { resultId?: string }).resultId;
      const addSourceMetadata = <T extends { audioOffsetMs: number }>(event: T): T => ({
        ...event,
        ...(config.sourceTextRange ? { textRange: { ...config.sourceTextRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
      const sourceBoundaries = boundaries.map((boundary) => addSourceMetadata(boundary));
      const sourceVisemes = visemes.map((viseme) => addSourceMetadata(viseme));
      const sourceBookmarks = bookmarks.map((bookmark) => addSourceMetadata(bookmark));
      resolve({
        audioData: result.audioData,
        durationMs,
        ...(config.sourceTextRange ? { textRange: { ...config.sourceTextRange } } : {}),
        ...(requestId ? { requestId } : {}),
        ...(sourceBoundaries.length > 0
          ? { boundaries: sourceBoundaries, wordBoundary: sourceBoundaries, wordBoundaries: sourceBoundaries }
          : {}),
        ...(sourceVisemes.length > 0 ? { visemes: sourceVisemes } : {}),
        ...(sourceBookmarks.length > 0 ? { bookmarks: sourceBookmarks } : {}),
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

/** Synthesizes chunks sequentially, annotates synchronization events, and merges the results. */
export async function synthesizeSsmlChunks(
  chunks: readonly (SsmlSynthesisChunk | string)[],
  config: TtsConfig,
): Promise<SsmlSynthesisResult> {
  const results: SsmlSynthesisResult[] = [];
  const totalChunks = chunks.length;
  for (const [index, chunk] of chunks.entries()) {
    const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
    const result = await synthesizeSsml(input.ssml, {
      ...config,
      ...(input.originalTextRange ? { sourceTextRange: input.originalTextRange } : {}),
      onProgress: undefined,
    });
    results.push(result);
    config.onProgress?.({
      currentChunk: index + 1,
      totalChunks,
      percent: totalChunks === 0 ? 100 : Math.round(((index + 1) / totalChunks) * 100),
    });
  }
  return mergeSynthesisResults(results);
}

/** Concatenates audio buffers and shifts all synchronization events by prior chunk durations. */
export function mergeSynthesisResults(results: readonly SsmlSynthesisResult[]): SsmlSynthesisResult {
  const audioLength = results.reduce((total, result) => total + result.audioData.byteLength, 0);
  const audioData = new Uint8Array(audioLength);
  const boundaries: NonNullable<SsmlSynthesisResult["boundaries"]> = [];
  const visemes: NonNullable<SsmlSynthesisResult["visemes"]> = [];
  const bookmarks: NonNullable<SsmlSynthesisResult["bookmarks"]> = [];
  let byteOffset = 0;
  let durationOffset = 0;

  for (const result of results) {
    audioData.set(new Uint8Array(result.audioData), byteOffset);
    byteOffset += result.audioData.byteLength;
    const chunkBoundaries =
      result.boundaries && result.boundaries.length > 0
        ? result.boundaries
        : (result.wordBoundary ?? result.wordBoundaries ?? []);
    for (const boundary of chunkBoundaries) {
      const textRange = boundary.textRange ?? result.textRange;
      const requestId = boundary.requestId ?? result.requestId;
      boundaries.push({
        ...boundary,
        audioOffsetMs: boundary.audioOffsetMs + durationOffset,
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    for (const viseme of result.visemes ?? []) {
      const textRange = viseme.textRange ?? result.textRange;
      const requestId = viseme.requestId ?? result.requestId;
      visemes.push({
        ...viseme,
        audioOffsetMs: viseme.audioOffsetMs + durationOffset,
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    for (const bookmark of result.bookmarks ?? []) {
      const textRange = bookmark.textRange ?? result.textRange;
      const requestId = bookmark.requestId ?? result.requestId;
      bookmarks.push({
        ...bookmark,
        audioOffsetMs: bookmark.audioOffsetMs + durationOffset,
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    durationOffset += Math.max(0, result.durationMs);
  }

  return {
    audioData: audioData.buffer,
    durationMs: durationOffset,
    ...(boundaries.length > 0 ? { boundaries, wordBoundary: boundaries, wordBoundaries: boundaries } : {}),
    ...(visemes.length > 0 ? { visemes } : {}),
    ...(bookmarks.length > 0 ? { bookmarks } : {}),
    ...(results.length === 1 && results[0]?.requestId ? { requestId: results[0].requestId } : {}),
    ...(results.length === 1 && results[0]?.textRange ? { textRange: { ...results[0].textRange } } : {}),
  };
}

/** Backward-compatible audio-only synthesis helper. */
export async function synthesizeSpeech(ssml: string, config: TtsConfig): Promise<ArrayBuffer> {
  return (await synthesizeSsml(ssml, config)).audioData;
}
