import type { SsmlSourceMarker, SsmlSourceTextSegment, SsmlTextRange } from "@ssml-builder-js/ssml-core";
import type { AzureTtsOutputFormat } from "./outputFormats.ts";

export interface TtsConfig {
  signal?: AbortSignal;
  timeoutMs?: number;
  endpoint?: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
  /** Original plain-text range represented by this synthesis request. */
  sourceTextRange?: { start: number; end: number };
  /** Reports chunk lifecycle events when using chunk synthesis. */
  onProgress?: (event: SynthesisProgressEvent) => void;
  /** Metadata used to map synchronization events back to the source document. */
  chunkIndex?: number;
  sourceNodePath?: string[];
  /** Exact source text segments used to map individual Azure events. */
  sourceTextSegments?: SsmlSourceTextSegment[];
  sourceMarkers?: SsmlSourceMarker[];
}

export type SynthesisChunkStatus = "pending" | "synthesizing" | "success" | "failed";

export interface SsmlSynthesisBoundary {
  text: string;
  audioOffsetMs: number;
  durationMs: number;
  textRange?: { start: number; end: number };
  /** Chunk that produced this event. */
  chunkIndex?: number;
  /** Path of the source SSML node, when available. */
  sourceNodePath?: string[];
  /** Original text range represented by this event. */
  originalTextRange?: SsmlTextRange;
  /** Audio offset within the originating chunk before merge. */
  chunkAudioOffsetMs?: number;
  requestId?: string;
}

export interface SsmlSynthesisViseme {
  visemeId: number;
  audioOffsetMs: number;
  textRange?: { start: number; end: number };
  chunkIndex?: number;
  sourceNodePath?: string[];
  originalTextRange?: SsmlTextRange;
  chunkAudioOffsetMs?: number;
  requestId?: string;
}

export interface SsmlSynthesisBookmark {
  name: string;
  audioOffsetMs: number;
  textRange?: { start: number; end: number };
  chunkIndex?: number;
  sourceNodePath?: string[];
  originalTextRange?: SsmlTextRange;
  chunkAudioOffsetMs?: number;
  requestId?: string;
}

/** Audio and Azure Speech synchronization events emitted for one SSML request. */
export interface SsmlSynthesisResult {
  audioData: ArrayBuffer;
  durationMs: number;
  boundaries?: SsmlSynthesisBoundary[];
  /** Alias matching the Azure Speech event name. */
  wordBoundary?: SsmlSynthesisBoundary[];
  /** Alias for consumers that use Azure's word-boundary terminology. */
  wordBoundaries?: SsmlSynthesisBoundary[];
  visemes?: SsmlSynthesisViseme[];
  bookmarks?: SsmlSynthesisBookmark[];
  /** Request identifier returned by Azure Speech, when available. */
  requestId?: string;
  /** Original plain-text range represented by the result. */
  textRange?: { start: number; end: number };
  /** MIME type of a result produced by an explicit merge operation. */
  mimeType?: string;
}

export interface MergedSynthesisResult extends SsmlSynthesisResult {
  mimeType: string;
}

export interface SsmlSynthesisChunk {
  ssml: string;
  originalTextRange?: { start: number; end: number };
  sourceNodePath?: string[];
  sourceTextSegments?: SsmlSourceTextSegment[];
  sourceMarkers?: SsmlSourceMarker[];
}

export interface SynthesizeChunksOptions {
  onProgress?: (event: SynthesisProgressEvent) => void;
  outputFormat?: AzureTtsOutputFormat | string;
  signal?: AbortSignal;
  timeoutMs?: number;
  sourceNodePath?: string[];
}

export interface SynthesisProgressEvent {
  /** 1-based completed chunk count retained for backward compatibility. */
  currentChunk: number;
  totalChunks: number;
  percent: number;
  chunkIndex: number;
  originalTextRange?: SsmlTextRange;
  status: SynthesisChunkStatus;
  durationMs: number;
  error?: unknown;
}

export interface AzureTtsLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface AzureTtsClientOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  subscriptionKey: string;
  region: string;
  endpoint?: string;
  outputFormat?: string;
  logger?: AzureTtsLogger;
  onProgress?: (event: SynthesisProgressEvent) => void;
}
