import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { getSsmlSourceMap } from "@ssml-builder-js/ssml-core";
import {
  MergeError,
  SynthesisCancelledError,
  SynthesisTimeoutError,
  toSynthesisError,
  UnsupportedMergeFormatError,
} from "./errors.ts";
import { resolveMimeType, type AzureTtsOutputFormat } from "./outputFormats.ts";
import { createSpeechConfig } from "./speechConfig.ts";
import type {
  MergedSynthesisResult,
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  SynthesisProgressEvent,
  TtsConfig,
} from "./types.ts";

export type MergeAudioFormat = "wav" | "mp3" | "raw";

export interface MergeAudioOptions {
  format: AzureTtsOutputFormat;
}

export interface MergeSynthesisOptions extends MergeAudioOptions {
  customMerger?: (buffers: ArrayBuffer[], format: string) => Promise<ArrayBuffer> | ArrayBuffer;
}

type AsyncMergeSynthesisOptions = MergeSynthesisOptions & {
  customMerger: NonNullable<MergeSynthesisOptions["customMerger"]>;
};

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

interface RiffChunk {
  id: string;
  data: Uint8Array;
}

interface ParsedWav {
  chunks: RiffChunk[];
  data: Uint8Array;
  format: Uint8Array;
}

function parseWav(buffer: ArrayBuffer): ParsedWav {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WAVE")) {
    throw new Error("Invalid WAV/RIFF audio buffer.");
  }
  const chunks: RiffChunk[] = [];
  const dataParts: Uint8Array[] = [];
  let format: Uint8Array | undefined;
  let offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("Invalid WAV chunk header.");
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = readUint32(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.byteLength) throw new Error(`WAV chunk "${id}" exceeds the audio buffer.`);
    const data = bytes.slice(dataStart, dataEnd);
    chunks.push({ id, data });
    if (id === "fmt ") format ??= data;
    if (id === "data") dataParts.push(data);
    offset = dataEnd + (size & 1);
    if (offset > bytes.byteLength) throw new Error("Invalid WAV chunk padding.");
  }
  if (!format || dataParts.length === 0) throw new Error("WAV audio must contain fmt and data chunks.");
  const dataLength = dataParts.reduce((total, part) => total + part.byteLength, 0);
  const data = new Uint8Array(dataLength);
  let dataOffset = 0;
  for (const part of dataParts) {
    data.set(part, dataOffset);
    dataOffset += part.byteLength;
  }
  return { chunks, data, format };
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer).setUint32(offset, value, true);
}

function writeChunk(target: Uint8Array, offset: number, id: string, data: Uint8Array): number {
  for (let index = 0; index < 4; index += 1) target[offset + index] = id.charCodeAt(index) ?? 0;
  writeUint32(target, offset + 4, data.byteLength);
  target.set(data, offset + 8);
  const end = offset + 8 + data.byteLength;
  if (data.byteLength & 1) target[end] = 0;
  return end + (data.byteLength & 1);
}

function mergeWavBuffers(buffers: readonly ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) return new ArrayBuffer(0);
  const parsed = buffers.map(parseWav);
  const first = parsed[0];
  if (!first) throw new Error("At least one WAV buffer is required.");
  if (
    parsed.some(
      (item) => item.format.length !== first.format.length || item.format.some((value, i) => value !== first.format[i]),
    )
  )
    throw new Error("WAV buffers have incompatible fmt chunks.");
  const dataLength = parsed.reduce((total, item) => total + item.data.byteLength, 0);
  const nonDataLength = first.chunks.reduce(
    (total, chunk) => (chunk.id === "data" ? total : total + 8 + chunk.data.byteLength + (chunk.data.byteLength & 1)),
    0,
  );
  const outputLength = 12 + nonDataLength + 8 + dataLength + (dataLength & 1);
  if (outputLength - 8 > 0xffffffff) throw new RangeError("Merged WAV exceeds the RIFF format size limit.");
  const output = new Uint8Array(outputLength);
  output.set(Uint8Array.from([0x52, 0x49, 0x46, 0x46]), 0);
  writeUint32(output, 4, outputLength - 8);
  output.set(Uint8Array.from([0x57, 0x41, 0x56, 0x45]), 8);
  let outputOffset = 12;
  let dataWritten = false;
  for (const chunk of first.chunks) {
    if (chunk.id === "data") {
      if (dataWritten) continue;
      const data = new Uint8Array(dataLength);
      let dataOffset = 0;
      for (const item of parsed) {
        data.set(item.data, dataOffset);
        dataOffset += item.data.byteLength;
      }
      outputOffset = writeChunk(output, outputOffset, "data", data);
      dataWritten = true;
    } else {
      outputOffset = writeChunk(output, outputOffset, chunk.id, chunk.data);
    }
  }
  if (!dataWritten) throw new Error("WAV audio must contain a data chunk.");
  return output.buffer;
}

function skipId3v2(bytes: Uint8Array): number {
  if (!ascii(bytes, 0, "ID3") || bytes.byteLength < 10) return 0;
  const size = [bytes[6], bytes[7], bytes[8], bytes[9]].reduce((total, value) => (total << 7) | (value & 0x7f), 0);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  return Math.min(bytes.byteLength, 10 + size + (hasFooter ? 10 : 0));
}

function stripMp3Tags(buffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(buffer);
  const start = skipId3v2(bytes);
  const end =
    bytes.byteLength >= 128 && ascii(bytes, bytes.byteLength - 128, "TAG") ? bytes.byteLength - 128 : bytes.byteLength;
  return bytes.slice(Math.min(start, end), end);
}

function isMp3Format(format: string): boolean {
  return /(?:mp3|mpeg)/i.test(format);
}

function isWavFormat(format: string): boolean {
  return /(?:wav|wave|riff)/i.test(format);
}

function isRawFormat(format: string): boolean {
  return /^raw(?:-|$)/i.test(format);
}

/** Returns whether the named output format can be safely concatenated without re-multiplexing. */
export function resolveMergeAudioFormat(format: string): MergeAudioFormat | undefined {
  if (isWavFormat(format)) return "wav";
  if (isMp3Format(format)) return "mp3";
  if (isRawFormat(format)) return "raw";
  return undefined;
}

export function canMergeAudioFormat(format: string): boolean {
  return resolveMergeAudioFormat(format) !== undefined;
}

/** Merges audio buffers while preserving the invariants of supported containers. */
export function mergeAudioBuffers(buffers: readonly ArrayBuffer[], options: MergeAudioOptions): ArrayBuffer;
export function mergeAudioBuffers(buffers: readonly ArrayBuffer[], options: MergeAudioOptions | string): ArrayBuffer {
  const format = typeof options === "string" ? options : options?.format;
  if (!format) throw new UnsupportedMergeFormatError("");
  try {
    if (isWavFormat(format)) return mergeWavBuffers(buffers);
    if (isMp3Format(format)) {
      const parts = buffers.map(stripMp3Tags);
      const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
      let offset = 0;
      for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
      }
      return output.buffer;
    }
    if (isRawFormat(format)) {
      const output = new Uint8Array(buffers.reduce((total, buffer) => total + buffer.byteLength, 0));
      let offset = 0;
      for (const buffer of buffers) {
        output.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      return output.buffer;
    }
    throw new UnsupportedMergeFormatError(format);
  } catch (error) {
    if (error instanceof UnsupportedMergeFormatError || error instanceof MergeError) throw error;
    throw new MergeError(`Audio buffers could not be merged for format "${format}".`, error);
  }
}

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
    throw new SynthesisCancelledError();
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
      reject(toSynthesisError(error));
    };

    const boundaries: SsmlSynthesisResult["boundaries"] = [];
    const visemes: SsmlSynthesisResult["visemes"] = [];
    const bookmarks: SsmlSynthesisResult["bookmarks"] = [];
    let sourceEventCursor = 0;
    let generatedSourceMap: ReturnType<typeof getSsmlSourceMap> | undefined;
    if (!config.sourceTextSegments && !config.sourceMarkers) {
      try {
        generatedSourceMap = getSsmlSourceMap(ssml);
      } catch {
        generatedSourceMap = undefined;
      }
    }
    const sourceBaseOffset = config.sourceTextRange?.start ?? 0;
    const sourceSegments =
      config.sourceTextSegments ??
      generatedSourceMap?.segments.map((segment) => ({
        ...segment,
        range: {
          start: segment.range.start + sourceBaseOffset,
          end: segment.range.end + sourceBaseOffset,
        },
        sourceNodePath: [...segment.sourceNodePath],
      })) ??
      [];
    const sourceMarkers =
      config.sourceMarkers ??
      generatedSourceMap?.markers.map((marker) => ({
        ...marker,
        originalTextRange: {
          start: marker.originalTextRange.start + sourceBaseOffset,
          end: marker.originalTextRange.end + sourceBaseOffset,
        },
        sourceNodePath: [...marker.sourceNodePath],
      })) ??
      [];
    const sourceText = sourceSegments.map((segment) => segment.text).join("");
    const mapSourceEvent = (
      text: string | undefined,
      offsetHint: number | undefined,
      markerName?: string,
    ): {
      textRange?: { start: number; end: number };
      originalTextRange?: { start: number; end: number };
      sourceNodePath?: string[];
    } => {
      const marker = markerName ? sourceMarkers.find((candidate) => candidate.name === markerName) : undefined;
      if (marker) {
        return {
          originalTextRange: { ...marker.originalTextRange },
          sourceNodePath: [...marker.sourceNodePath],
          textRange: { ...marker.originalTextRange },
        };
      }
      if (sourceSegments.length === 0 && !config.sourceTextRange && !config.sourceNodePath) return {};
      const value = text ?? "";
      let localStart = Number.isFinite(offsetHint) && (offsetHint ?? 0) >= 0 ? (offsetHint as number) : -1;
      if (value && localStart >= 0 && sourceText.slice(localStart, localStart + value.length) !== value)
        localStart = -1;
      if (localStart < 0 || localStart > sourceText.length) {
        localStart = value ? sourceText.indexOf(value, sourceEventCursor) : sourceEventCursor;
        if (localStart < 0) localStart = value ? sourceText.indexOf(value) : sourceEventCursor;
      }
      localStart = Math.max(0, localStart);
      const localEnd = Math.min(sourceText.length, localStart + value.length);
      sourceEventCursor = Math.max(sourceEventCursor, localEnd);
      const baseStart = config.sourceTextRange?.start ?? sourceSegments[0]?.range.start ?? 0;
      const fallbackRange = { start: baseStart + localStart, end: baseStart + localEnd };
      const segment =
        sourceSegments.find(({ range }) => range.start <= fallbackRange.start && range.end > fallbackRange.start) ??
        sourceSegments.find(({ range }) => range.end > fallbackRange.start) ??
        (value.length === 0
          ? sourceSegments.find(({ range }) => range.start <= fallbackRange.start && range.end >= fallbackRange.start)
          : undefined);
      return {
        originalTextRange: { ...fallbackRange },
        textRange: { ...fallbackRange },
        ...(segment
          ? { sourceNodePath: [...segment.sourceNodePath] }
          : config.sourceNodePath
            ? { sourceNodePath: [...config.sourceNodePath] }
            : {}),
      };
    };
    synthesizer.wordBoundary = (_sender, event) => {
      boundaries.push({
        text: event.text,
        audioOffsetMs: ticksToMilliseconds(event.audioOffset),
        durationMs: ticksToMilliseconds(event.duration),
        ...mapSourceEvent(
          event.text,
          (event as SpeechSDK.SpeechSynthesisWordBoundaryEventArgs & { textOffset?: number }).textOffset,
        ),
      });
    };
    synthesizer.visemeReceived = (_sender, event) => {
      const eventWithOffset = event as SpeechSDK.SpeechSynthesisVisemeEventArgs & { textOffset?: number };
      visemes.push({
        visemeId: event.visemeId,
        audioOffsetMs: ticksToMilliseconds(event.audioOffset),
        ...mapSourceEvent(undefined, eventWithOffset.textOffset),
      });
    };
    synthesizer.bookmarkReached = (_sender, event) => {
      const eventWithOffset = event as SpeechSDK.SpeechSynthesisBookmarkEventArgs & { textOffset?: number };
      bookmarks.push({
        name: event.text,
        audioOffsetMs: ticksToMilliseconds(event.audioOffset),
        ...mapSourceEvent(undefined, eventWithOffset.textOffset, event.text),
      });
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
        ...(config.sourceTextRange && !("textRange" in event) ? { textRange: { ...config.sourceTextRange } } : {}),
        ...(config.sourceTextRange && !("originalTextRange" in event)
          ? { originalTextRange: { ...config.sourceTextRange } }
          : {}),
        ...(config.chunkIndex !== undefined ? { chunkIndex: config.chunkIndex } : {}),
        ...(config.sourceNodePath ? { sourceNodePath: [...config.sourceNodePath] } : {}),
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
        abortHandler = () => rejectWithError(new SynthesisCancelledError());
        config.signal.addEventListener("abort", abortHandler, { once: true });
      }
      if (config.timeoutMs !== undefined && config.timeoutMs > 0) {
        timeout = setTimeout(
          () => rejectWithError(new SynthesisTimeoutError(`Speech synthesis timed out after ${config.timeoutMs} ms.`)),
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
  const report = (event: SynthesisProgressEvent): void => config.onProgress?.(event);
  for (const [index, chunk] of chunks.entries()) {
    const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
    report({
      currentChunk: index,
      totalChunks,
      percent: totalChunks === 0 ? 100 : Math.round((index / totalChunks) * 100),
      chunkIndex: index,
      originalTextRange: input.originalTextRange,
      status: "pending",
      durationMs: 0,
    });
  }
  for (const [index, chunk] of chunks.entries()) {
    const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
    report({
      currentChunk: index,
      totalChunks,
      percent: totalChunks === 0 ? 100 : Math.round((index / totalChunks) * 100),
      chunkIndex: index,
      originalTextRange: input.originalTextRange,
      status: "synthesizing",
      durationMs: 0,
    });
    const startedAt = Date.now();
    try {
      const result = await synthesizeSsml(input.ssml, {
        ...config,
        ...(input.originalTextRange ? { sourceTextRange: input.originalTextRange } : {}),
        ...((input.sourceNodePath ?? config.sourceNodePath)
          ? { sourceNodePath: [...(input.sourceNodePath ?? config.sourceNodePath ?? [])] }
          : {}),
        ...(input.sourceTextSegments ? { sourceTextSegments: input.sourceTextSegments } : {}),
        ...(input.sourceMarkers ? { sourceMarkers: input.sourceMarkers } : {}),
        chunkIndex: index,
        onProgress: undefined,
      });
      results.push(result);
      report({
        currentChunk: index + 1,
        totalChunks,
        percent: totalChunks === 0 ? 100 : Math.round(((index + 1) / totalChunks) * 100),
        chunkIndex: index,
        originalTextRange: input.originalTextRange,
        status: "success",
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      report({
        currentChunk: index,
        totalChunks,
        percent: totalChunks === 0 ? 100 : Math.round((index / totalChunks) * 100),
        chunkIndex: index,
        originalTextRange: input.originalTextRange,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }
  return mergeSynthesisResults(results, {
    format: (config.outputFormat ?? "audio-16khz-128kbitrate-mono-mp3") as AzureTtsOutputFormat,
  });
}

/** Concatenates audio buffers and shifts all synchronization events by prior chunk durations. */
function createMergedResult(
  results: readonly SsmlSynthesisResult[],
  audioData: ArrayBuffer,
  format: string,
): MergedSynthesisResult {
  const boundaries: NonNullable<SsmlSynthesisResult["boundaries"]> = [];
  const visemes: NonNullable<SsmlSynthesisResult["visemes"]> = [];
  const bookmarks: NonNullable<SsmlSynthesisResult["bookmarks"]> = [];
  let durationOffset = 0;

  for (const [resultIndex, result] of results.entries()) {
    const chunkBoundaries =
      result.boundaries && result.boundaries.length > 0
        ? result.boundaries
        : (result.wordBoundary ?? result.wordBoundaries ?? []);
    for (const boundary of chunkBoundaries) {
      const textRange = boundary.textRange ?? result.textRange;
      const originalTextRange = boundary.originalTextRange ?? textRange;
      const requestId = boundary.requestId ?? result.requestId;
      boundaries.push({
        ...boundary,
        audioOffsetMs: boundary.audioOffsetMs + durationOffset,
        chunkAudioOffsetMs: boundary.chunkAudioOffsetMs ?? boundary.audioOffsetMs,
        ...(boundary.chunkIndex === undefined ? { chunkIndex: resultIndex } : {}),
        ...(boundary.sourceNodePath ? { sourceNodePath: [...boundary.sourceNodePath] } : {}),
        ...(originalTextRange ? { originalTextRange: { ...originalTextRange } } : {}),
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    for (const viseme of result.visemes ?? []) {
      const textRange = viseme.textRange ?? result.textRange;
      const originalTextRange = viseme.originalTextRange ?? textRange;
      const requestId = viseme.requestId ?? result.requestId;
      visemes.push({
        ...viseme,
        audioOffsetMs: viseme.audioOffsetMs + durationOffset,
        chunkAudioOffsetMs: viseme.chunkAudioOffsetMs ?? viseme.audioOffsetMs,
        ...(viseme.chunkIndex === undefined ? { chunkIndex: resultIndex } : {}),
        ...(viseme.sourceNodePath ? { sourceNodePath: [...viseme.sourceNodePath] } : {}),
        ...(originalTextRange ? { originalTextRange: { ...originalTextRange } } : {}),
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    for (const bookmark of result.bookmarks ?? []) {
      const textRange = bookmark.textRange ?? result.textRange;
      const originalTextRange = bookmark.originalTextRange ?? textRange;
      const requestId = bookmark.requestId ?? result.requestId;
      bookmarks.push({
        ...bookmark,
        audioOffsetMs: bookmark.audioOffsetMs + durationOffset,
        chunkAudioOffsetMs: bookmark.chunkAudioOffsetMs ?? bookmark.audioOffsetMs,
        ...(bookmark.chunkIndex === undefined ? { chunkIndex: resultIndex } : {}),
        ...(bookmark.sourceNodePath ? { sourceNodePath: [...bookmark.sourceNodePath] } : {}),
        ...(originalTextRange ? { originalTextRange: { ...originalTextRange } } : {}),
        ...(textRange ? { textRange: { ...textRange } } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    durationOffset += Math.max(0, result.durationMs);
  }

  return {
    audioData,
    durationMs: durationOffset,
    mimeType: resolveMimeType(format),
    ...(boundaries.length > 0 ? { boundaries, wordBoundary: boundaries, wordBoundaries: boundaries } : {}),
    ...(visemes.length > 0 ? { visemes } : {}),
    ...(bookmarks.length > 0 ? { bookmarks } : {}),
    ...(results.length === 1 && results[0]?.requestId ? { requestId: results[0].requestId } : {}),
    ...(results.length === 1 && results[0]?.textRange ? { textRange: { ...results[0].textRange } } : {}),
  };
}

export function mergeSynthesisResults(
  results: readonly SsmlSynthesisResult[],
  options: AsyncMergeSynthesisOptions,
): Promise<MergedSynthesisResult>;
export function mergeSynthesisResults(
  results: readonly SsmlSynthesisResult[],
  options: MergeAudioOptions,
): MergedSynthesisResult;
export function mergeSynthesisResults(
  results: readonly SsmlSynthesisResult[],
  options: MergeSynthesisOptions | string,
): SsmlSynthesisResult | Promise<SsmlSynthesisResult> {
  const resolvedOptions: MergeSynthesisOptions =
    typeof options === "string" ? { format: options as AzureTtsOutputFormat } : options;
  const format = resolvedOptions?.format;
  if (!format) throw new UnsupportedMergeFormatError("");
  const buffers = results.map((result) => result.audioData);
  if (resolvedOptions.customMerger) {
    return Promise.resolve()
      .then(() => resolvedOptions.customMerger?.(buffers, format))
      .then((merged) => {
        if (!merged) throw new MergeError("The custom audio merger returned no audio buffer.");
        return createMergedResult(results, merged, format);
      })
      .catch((error: unknown) => {
        if (error instanceof UnsupportedMergeFormatError || error instanceof MergeError) throw error;
        throw new MergeError(`Custom audio merger failed for format "${format}".`, error);
      });
  }
  try {
    return createMergedResult(results, mergeAudioBuffers(buffers, { format }), format);
  } catch (error) {
    if (error instanceof UnsupportedMergeFormatError || error instanceof MergeError) throw error;
    throw new MergeError(`Audio buffers could not be merged for format "${format}".`, error);
  }
}

/** Backward-compatible audio-only synthesis helper. */
export async function synthesizeSpeech(ssml: string, config: TtsConfig): Promise<ArrayBuffer> {
  return (await synthesizeSsml(ssml, config)).audioData;
}
