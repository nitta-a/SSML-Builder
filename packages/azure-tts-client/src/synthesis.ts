import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { getSsmlSourceMap } from "@ssml-builder-js/ssml-core";
import {
  AzureTtsError,
  MergeError,
  AudioFormatMismatchError,
  SynthesisCancelledError,
  SynthesisTimeoutError,
  toSynthesisError,
  UnsupportedMergeFormatError,
  getRetryAfterDelayMs,
} from "./errors.ts";
import { DEFAULT_OUTPUT_FORMAT, resolveMimeType, type AzureTtsOutputFormat } from "./outputFormats.ts";
import { createSpeechConfig } from "./speechConfig.ts";
import type {
  MergedSynthesisResult,
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  AudioSpecification,
  SynthesisProgressEvent,
  TtsConfig,
  RetryOptions,
  CustomAudioMerger,
  PostMergeValidator,
} from "./types.ts";

export type MergeAudioFormat = "wav" | "mp3" | "raw";

export interface MergeAudioOptions {
  format: AzureTtsOutputFormat;
  signal?: AbortSignal;
  outputMimeType?: string;
}

export type InputAudioSpecs = AudioSpecification[];

export interface MergeSynthesisOptions extends MergeAudioOptions {
  customMerger?: CustomAudioMerger;
  postMergeValidator?: PostMergeValidator;
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

function formatNumber(format: string, pattern: RegExp, fallback: number): number {
  const match = pattern.exec(format);
  return match?.[1] ? Number(match[1]) : fallback;
}

function formatChannels(format: string, fallback: number): number {
  if (/stereo|2ch|dual/i.test(format)) return 2;
  if (/mono|1ch/i.test(format)) return 1;
  return fallback;
}

function formatAudioSpecification(format: string): AudioSpecification {
  const sampleRate = formatNumber(format, /(\d+)(?:khz|kHz|hz|Hz)/, 0);
  const channels = formatChannels(format, 0);
  const bitrateMatch = /(\d+)(?:kbitrate|kbps|kbits?)/i.exec(format);
  const bitrate = bitrateMatch?.[1] ? Number(bitrateMatch[1]) * 1000 : undefined;
  const codec: AudioSpecification["codec"] = /mp3|mpeg/i.test(format)
    ? "mp3"
    : /opus/i.test(format)
      ? "opus"
      : /silk/i.test(format)
        ? "silk"
        : /pcm|mulaw|alaw|siren/i.test(format)
          ? "pcm"
          : "unknown";
  const bitDepthMatch = /(\d+)bit/i.exec(format);
  const container = /(?:wav|wave|riff)/i.test(format)
    ? "riff-wave"
    : /mp3|mpeg/i.test(format)
      ? "mp3-raw"
      : /ogg/i.test(format)
        ? "ogg"
        : /webm/i.test(format)
          ? "webm"
          : /raw/i.test(format)
            ? "raw"
            : undefined;
  return {
    format,
    mimeType: resolveMimeType(format),
    codec,
    sampleRate,
    channels,
    ...(bitrate ? { bitrate } : {}),
    ...(bitDepthMatch?.[1] ? { bitDepth: Number(bitDepthMatch[1]) } : {}),
    ...(container ? { container } : {}),
    isVbr: /vbr/i.test(format),
    isCompressed: codec === "mp3" || codec === "opus" || codec === "silk",
  };
}

function parseMp3Specification(buffer: ArrayBuffer, format: string): AudioSpecification | undefined {
  const bytes = stripMp3Tags(buffer);
  const bitrates = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  ];
  const sampleRates = [
    [44_100, 48_000, 32_000],
    [22_050, 24_000, 16_000],
    [11_025, 12_000, 8_000],
  ];
  for (let index = 0; index + 4 <= bytes.length; index += 1) {
    if (bytes[index] !== 0xff || (bytes[index + 1] ?? 0) < 0xe0) continue;
    const header = bytes[index + 1] ?? 0;
    const versionBits = (header >> 3) & 0x03;
    const layer = (header >> 1) & 0x03;
    const bitrateIndex = (bytes[index + 2] ?? 0) >> 4;
    const sampleIndex = ((bytes[index + 2] ?? 0) >> 2) & 0x03;
    if (versionBits === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) continue;
    const versionIndex = versionBits === 3 ? 0 : versionBits === 2 ? 1 : 2;
    const bitrateTable = versionBits === 3 ? bitrates[1] : bitrates[2];
    const sampleRate = sampleRates[versionIndex]?.[sampleIndex] ?? 0;
    const bitrateKbps = bitrateTable?.[bitrateIndex] ?? 0;
    if (!sampleRate || !bitrateKbps) continue;
    return {
      format,
      mimeType: "audio/mpeg",
      codec: "mp3",
      sampleRate,
      channels: (bytes[index + 3] ?? 0) >> 6 === 3 ? 1 : 2,
      bitrate: bitrateKbps * 1000,
      container: "mp3-raw",
      isVbr: false,
      isCompressed: true,
    };
  }
  return undefined;
}

/** Extracts the stream specification from a WAV/MP3 header and output-format fallback. */
export function inspectAudioSpecification(buffer: ArrayBuffer, format: string): AudioSpecification {
  if (isWavFormat(format) || ascii(new Uint8Array(buffer), 0, "RIFF")) {
    const parsed = parseWav(buffer);
    if (parsed.format.byteLength < 16) throw new Error("Invalid WAV fmt chunk.");
    const view = new DataView(parsed.format.buffer, parsed.format.byteOffset, parsed.format.byteLength);
    const sampleRate = view.getUint32(4, true);
    const channels = view.getUint16(2, true);
    const bitsPerSample = parsed.format.byteLength >= 16 ? view.getUint16(14, true) : 0;
    const formatCode = view.getUint16(0, true);
    return {
      format,
      mimeType: "audio/wav",
      codec: formatCode === 1 ? "pcm" : "unknown",
      sampleRate,
      channels,
      ...(sampleRate && channels && bitsPerSample ? { bitrate: sampleRate * channels * bitsPerSample } : {}),
      bitDepth: bitsPerSample,
      container: "riff-wave",
      isVbr: false,
      isCompressed: formatCode !== 1,
    };
  }
  if (isMp3Format(format)) return parseMp3Specification(buffer, format) ?? formatAudioSpecification(format);
  return formatAudioSpecification(format);
}

function validateAudioSpecifications(specs: readonly AudioSpecification[]): void {
  const first = specs[0];
  if (!first) return;
  const mismatch = specs.find(
    (spec) =>
      spec.sampleRate !== first.sampleRate ||
      spec.channels !== first.channels ||
      (first.bitrate !== undefined && spec.bitrate !== undefined && spec.bitrate !== first.bitrate) ||
      (first.bitDepth !== undefined && spec.bitDepth !== undefined && spec.bitDepth !== first.bitDepth) ||
      (first.container !== undefined && spec.container !== undefined && spec.container !== first.container) ||
      (first.isVbr !== undefined && spec.isVbr !== undefined && spec.isVbr !== first.isVbr),
  );
  if (mismatch)
    throw new AudioFormatMismatchError(
      `Audio chunks have incompatible specifications: ${first.sampleRate}Hz/${first.channels}ch versus ${mismatch.sampleRate}Hz/${mismatch.channels}ch.`,
      specs,
    );
}

function isAudioFormatMismatch(error: unknown): error is AudioFormatMismatchError {
  return (
    error instanceof AudioFormatMismatchError ||
    (error !== null && typeof error === "object" && "kind" in error && error.kind === "audio-format-mismatch")
  );
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
    validateAudioSpecifications(buffers.map((buffer) => inspectAudioSpecification(buffer, format)));
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
    if (error instanceof UnsupportedMergeFormatError || isAudioFormatMismatch(error) || error instanceof MergeError)
      throw error;
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
      mappingStatus: "exact" | "fallback" | "unmapped";
    } => {
      const marker = markerName ? sourceMarkers.find((candidate) => candidate.name === markerName) : undefined;
      if (marker) {
        return {
          originalTextRange: { ...marker.originalTextRange },
          sourceNodePath: [...marker.sourceNodePath],
          textRange: { ...marker.originalTextRange },
          mappingStatus: "exact",
        };
      }
      if (sourceSegments.length === 0 && !config.sourceTextRange && !config.sourceNodePath) {
        return { mappingStatus: "unmapped" };
      }
      const value = text ?? "";
      let localStart = Number.isFinite(offsetHint) && (offsetHint ?? 0) >= 0 ? (offsetHint as number) : -1;
      let mappingStatus: "exact" | "fallback" | "unmapped" = "exact";
      if (value && localStart >= 0 && sourceText.slice(localStart, localStart + value.length) !== value) {
        localStart = -1;
        mappingStatus = "fallback";
      }
      if (localStart < 0 || localStart > sourceText.length) {
        localStart = value ? sourceText.indexOf(value, sourceEventCursor) : sourceEventCursor;
        if (localStart < 0) localStart = value ? sourceText.indexOf(value) : sourceEventCursor;
        mappingStatus = "fallback";
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
        mappingStatus: segment || config.sourceTextRange || config.sourceNodePath ? mappingStatus : "unmapped",
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
      const addSourceMetadata = <T extends { audioOffsetMs: number; mappingStatus: "exact" | "fallback" | "unmapped" }>(
        event: T,
      ): T => {
        const mapped = {
          ...event,
          ...(config.sourceTextRange && !("textRange" in event) ? { textRange: { ...config.sourceTextRange } } : {}),
          ...(config.sourceTextRange && !("originalTextRange" in event)
            ? { originalTextRange: { ...config.sourceTextRange } }
            : {}),
          ...(config.chunkIndex !== undefined ? { chunkIndex: config.chunkIndex } : {}),
          ...(config.sourceNodePath ? { sourceNodePath: [...config.sourceNodePath] } : {}),
          ...(requestId ? { requestId } : {}),
        } as T;
        if (event.mappingStatus === "unmapped") {
          Object.defineProperty(mapped, "mappingStatus", { value: "unmapped", enumerable: false });
          Object.defineProperty(mapped, "toJSON", {
            value: () => ({ ...mapped, mappingStatus: "unmapped" }),
            enumerable: false,
          });
        }
        return mapped;
      };
      const sourceBoundaries = boundaries.map((boundary) => addSourceMetadata(boundary));
      const sourceVisemes = visemes.map((viseme) => addSourceMetadata(viseme));
      const sourceBookmarks = bookmarks.map((bookmark) => addSourceMetadata(bookmark));
      resolve({
        audioData: result.audioData,
        durationMs,
        audioSpec: inspectAudioSpecification(result.audioData, config.outputFormat ?? DEFAULT_OUTPUT_FORMAT),
        mimeType: resolveMimeType(config.outputFormat ?? DEFAULT_OUTPUT_FORMAT),
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
      const timeoutMs = config.timeouts?.perChunkMs ?? config.timeoutMs;
      if (timeoutMs !== undefined && timeoutMs > 0) {
        timeout = setTimeout(
          () => rejectWithError(new SynthesisTimeoutError(`Speech synthesis timed out after ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }
      synthesizer.speakSsmlAsync(ssml, cb, rejectWithError);
    } catch (error) {
      rejectWithError(error);
    }
  });
}

function isRetryableSynthesisError(error: unknown): boolean {
  if (error instanceof SynthesisCancelledError || error instanceof SynthesisTimeoutError) return false;
  if (error instanceof AzureTtsError && error.status !== 0)
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  const message = error instanceof Error ? error.message : String(error);
  if (/\b4\d{2}\b/.test(message)) return false;
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (typeof status === "number") return status === 429 || (status >= 500 && status < 600);
  return /network|connection|connect|socket|fetch failed|econn|etimedout|temporar|transient|unavailable/i.test(message);
}

function retryDelay(options: RetryOptions, retryAttempt: number, error?: unknown): number {
  const retryAfterMs = getRetryAfterDelayMs(error);
  if (retryAfterMs !== undefined) return retryAfterMs;
  const base = Math.min(options.maxDelayMs, options.initialDelayMs * 2 ** Math.max(0, retryAttempt - 1));
  return Math.floor(Math.random() * (base + 1));
}

function resolveConcurrency(value: number | undefined, total: number): number {
  if (value === undefined) return 1;
  if (value === Infinity) return Math.max(1, total);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new SynthesisCancelledError();
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new SynthesisCancelledError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    if (signal) {
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

async function synthesizeWithRetry(
  ssml: string,
  config: TtsConfig,
  retryOptions: RetryOptions | undefined,
  onRetry: (retryAttempt: number, nextRetryDelayMs: number) => void,
): Promise<SsmlSynthesisResult> {
  const options = retryOptions
    ? {
        maxRetries: Math.max(0, Math.floor(retryOptions.maxRetries)),
        initialDelayMs: Math.max(0, retryOptions.initialDelayMs),
        maxDelayMs: Math.max(0, retryOptions.maxDelayMs),
        shouldRetry: retryOptions.shouldRetry,
      }
    : undefined;
  let attempt = 0;
  while (true) {
    if (config.signal?.aborted) throw new SynthesisCancelledError();
    try {
      return await synthesizeSsml(ssml, config);
    } catch (error) {
      if (
        !options ||
        attempt >= options.maxRetries ||
        !(options.shouldRetry?.(error, attempt + 1) ?? isRetryableSynthesisError(error))
      )
        throw error;
      attempt += 1;
      const delayMs = retryDelay(options, attempt, error);
      onRetry(attempt, delayMs);
      await waitForRetry(delayMs, config.signal);
    }
  }
}

interface AbortScope {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
  abort: () => void;
}

function createAbortScope(parent: AbortSignal | undefined, timeoutMs: number | undefined): AbortScope {
  const controller = new AbortController();
  let didTimeout = false;
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  const timer =
    timeoutMs !== undefined && timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs)
      : undefined;
  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    dispose: () => {
      if (timer) clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
    abort: () => controller.abort(),
  };
}

async function synthesizeChunkWithTimeout(
  ssml: string,
  config: TtsConfig,
  retryOptions: RetryOptions | undefined,
  timeoutMs: number | undefined,
  onRetry: (retryAttempt: number, nextRetryDelayMs: number) => void,
): Promise<SsmlSynthesisResult> {
  const scope = createAbortScope(config.signal, timeoutMs);
  try {
    return await synthesizeWithRetry(ssml, { ...config, signal: scope.signal }, retryOptions, onRetry);
  } catch (error) {
    if (scope.timedOut()) throw new SynthesisTimeoutError(`Speech synthesis timed out after ${timeoutMs} ms.`);
    throw error;
  } finally {
    scope.dispose();
  }
}

/** Synthesizes chunks with bounded concurrency, retries transient failures, and merges in chunk order. */
export async function synthesizeSsmlChunks(
  chunks: readonly (SsmlSynthesisChunk | string)[],
  config: TtsConfig,
): Promise<SsmlSynthesisResult> {
  const results: Array<SsmlSynthesisResult | undefined> = new Array(chunks.length);
  const totalChunks = chunks.length;
  const cachedChunks = new Map((config.resumeChunks ?? []).map((chunk) => [chunk.chunkIndex, chunk]));
  for (const [index, cached] of cachedChunks) {
    if (index >= 0 && index < totalChunks) results[index] = cached;
  }
  const requestedIndices = config.resumeChunkIndices
    ? new Set(config.resumeChunkIndices.filter((index) => index >= 0 && index < totalChunks))
    : undefined;
  const shouldSynthesize = (index: number): boolean =>
    !cachedChunks.has(index) && (requestedIndices === undefined || requestedIndices.has(index));
  const scope = createAbortScope(config.signal, config.timeouts?.totalJobMs);
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
  let completed = [...results].filter((result) => result !== undefined).length;
  let nextIndex = 0;
  const concurrency = resolveConcurrency(config.concurrency, chunks.length);
  let firstError: unknown;
  const failedIndices = new Set<number>();
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= chunks.length) return;
      if (!shouldSynthesize(index)) continue;
      if (firstError && config.cancelOnFailure !== false) return;
      const chunk = chunks[index];
      const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
      report({
        currentChunk: completed,
        totalChunks,
        percent: totalChunks === 0 ? 100 : Math.round((completed / totalChunks) * 100),
        chunkIndex: index,
        originalTextRange: input.originalTextRange,
        status: "synthesizing",
        durationMs: 0,
      });
      const startedAt = Date.now();
      try {
        const result = await synthesizeChunkWithTimeout(
          input.ssml,
          {
            ...config,
            signal: scope.signal,
            ...(input.originalTextRange ? { sourceTextRange: input.originalTextRange } : {}),
            ...((input.sourceNodePath ?? config.sourceNodePath)
              ? { sourceNodePath: [...(input.sourceNodePath ?? config.sourceNodePath ?? [])] }
              : {}),
            ...(input.sourceTextSegments ? { sourceTextSegments: input.sourceTextSegments } : {}),
            ...(input.sourceMarkers ? { sourceMarkers: input.sourceMarkers } : {}),
            chunkIndex: index,
            onProgress: undefined,
          },
          config.retryOptions,
          config.timeouts?.chunkWithRetriesMs ?? config.timeouts?.perChunkMs ?? config.timeoutMs,
          (retryAttempt, nextRetryDelayMs) =>
            report({
              currentChunk: completed,
              totalChunks,
              percent: totalChunks === 0 ? 100 : Math.round((completed / totalChunks) * 100),
              chunkIndex: index,
              originalTextRange: input.originalTextRange,
              status: "synthesizing",
              durationMs: Date.now() - startedAt,
              retryAttempt,
              nextRetryDelayMs,
              isRetrying: true,
            }),
        );
        results[index] = result;
        completed += 1;
        report({
          currentChunk: completed,
          totalChunks,
          percent: totalChunks === 0 ? 100 : Math.round((completed / totalChunks) * 100),
          chunkIndex: index,
          originalTextRange: input.originalTextRange,
          status: "success",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        failedIndices.add(index);
        report({
          currentChunk: completed,
          totalChunks,
          percent: totalChunks === 0 ? 100 : Math.round((completed / totalChunks) * 100),
          chunkIndex: index,
          originalTextRange: input.originalTextRange,
          status: "failed",
          durationMs: Date.now() - startedAt,
          error,
        });
        firstError ??= scope.timedOut()
          ? new SynthesisTimeoutError(`Speech synthesis timed out after ${config.timeouts?.totalJobMs} ms.`)
          : error;
        if (config.cancelOnFailure !== false) scope.abort();
        return;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()));
    if (firstError) throw firstError;
    const orderedResults = results.filter((result): result is SsmlSynthesisResult => result !== undefined);
    return await mergeSynthesisResults(orderedResults, {
      format: (config.outputFormat ?? DEFAULT_OUTPUT_FORMAT) as AzureTtsOutputFormat,
      signal: scope.signal,
      customMerger: config.customMerger,
      outputMimeType: config.outputMimeType,
      postMergeValidator: config.postMergeValidator,
    });
  } catch (error) {
    const partial = {
      synthesizedChunks: results.flatMap((result, chunkIndex) => (result ? [{ ...result, chunkIndex }] : [])),
      completedChunks: results.flatMap((result, chunkIndex) => (result ? [{ ...result, chunkIndex }] : [])),
      pendingChunkIndices: chunks.flatMap((_chunk, chunkIndex) => (results[chunkIndex] ? [] : [chunkIndex])),
      failedChunkIndices: [...failedIndices],
      totalChunks,
    };
    if (error && typeof error === "object") (error as { partialResult?: unknown }).partialResult = partial;
    throw error;
  } finally {
    scope.dispose();
  }
}

/** Concatenates audio buffers and shifts all synchronization events by prior chunk durations. */
function createMergedResult(
  results: readonly SsmlSynthesisResult[],
  audioData: ArrayBuffer,
  format: string,
  audioSpec?: AudioSpecification,
  outputMimeType?: string,
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
        mappingStatus: boundary.mappingStatus ?? "unmapped",
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
        mappingStatus: viseme.mappingStatus ?? "unmapped",
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
        mappingStatus: bookmark.mappingStatus ?? "unmapped",
      });
    }
    durationOffset += Math.max(0, result.durationMs);
  }

  return {
    audioData,
    durationMs: durationOffset,
    mimeType: resolveMimeType(format),
    audioSpec: audioSpec ?? formatAudioSpecification(format),
    ...(outputMimeType ? { mimeType: outputMimeType } : {}),
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
  options: MergeSynthesisOptions,
): MergedSynthesisResult | Promise<MergedSynthesisResult>;
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
  const inputSpecs = results.map((result) => result.audioSpec ?? inspectAudioSpecification(result.audioData, format));
  validateAudioSpecifications(inputSpecs);
  const signal = resolvedOptions.signal ?? new AbortController().signal;
  if (signal.aborted) throw new SynthesisCancelledError();
  if (resolvedOptions.customMerger) {
    return Promise.resolve()
      .then(() =>
        resolvedOptions.customMerger?.(buffers, {
          format,
          outputMimeType: resolvedOptions.outputMimeType ?? resolveMimeType(format),
          inputSpecs,
          signal,
        }),
      )
      .then((merged) => {
        if (!merged) throw new MergeError("The custom audio merger returned no audio buffer.");
        if (
          !(merged instanceof ArrayBuffer) ||
          (buffers.some((buffer) => buffer.byteLength > 0) && merged.byteLength === 0)
        )
          throw new MergeError("The custom audio merger returned an invalid audio buffer.");
        if (signal.aborted) throw new SynthesisCancelledError();
        const result = createMergedResult(
          results,
          merged,
          format,
          inspectAudioSpecification(merged, format),
          resolvedOptions.outputMimeType,
        );
        return Promise.resolve(
          resolvedOptions.postMergeValidator?.(result, {
            format,
            outputMimeType: resolvedOptions.outputMimeType ?? resolveMimeType(format),
            inputSpecs,
            signal,
          }),
        ).then((valid) => {
          if (valid === false) throw new MergeError("The post-merge validator rejected the merged audio.");
          return result;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof UnsupportedMergeFormatError || isAudioFormatMismatch(error) || error instanceof MergeError)
          throw error;
        throw new MergeError(`Custom audio merger failed for format "${format}".`, error);
      });
  }
  try {
    const result = createMergedResult(
      results,
      mergeAudioBuffers(buffers, { format }),
      format,
      inputSpecs[0],
      resolvedOptions.outputMimeType,
    );
    if (resolvedOptions.postMergeValidator) {
      const validation = resolvedOptions.postMergeValidator(result, {
        format,
        outputMimeType: resolvedOptions.outputMimeType ?? resolveMimeType(format),
        inputSpecs,
        signal,
      });
      if (validation instanceof Promise)
        return validation.then((valid) => {
          if (valid === false) throw new MergeError("The post-merge validator rejected the merged audio.");
          return result;
        });
      if (validation === false) throw new MergeError("The post-merge validator rejected the merged audio.");
    }
    return result;
  } catch (error) {
    if (error instanceof UnsupportedMergeFormatError || isAudioFormatMismatch(error) || error instanceof MergeError)
      throw error;
    throw new MergeError(`Audio buffers could not be merged for format "${format}".`, error);
  }
}

/** Backward-compatible audio-only synthesis helper. */
export async function synthesizeSpeech(ssml: string, config: TtsConfig): Promise<ArrayBuffer> {
  return (await synthesizeSsml(ssml, config)).audioData;
}
