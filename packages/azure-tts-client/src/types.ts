export interface TtsConfig {
  signal?: AbortSignal;
  timeoutMs?: number;
  endpoint?: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
  /** Original plain-text range represented by this synthesis request. */
  sourceTextRange?: { start: number; end: number };
  /** Reports completion of a chunk when using synthesizeSsmlChunks. */
  onProgress?: (event: { currentChunk: number; totalChunks: number; percent: number }) => void;
}

export interface SsmlSynthesisBoundary {
  text: string;
  audioOffsetMs: number;
  durationMs: number;
  textRange?: { start: number; end: number };
  requestId?: string;
}

export interface SsmlSynthesisViseme {
  visemeId: number;
  audioOffsetMs: number;
  textRange?: { start: number; end: number };
  requestId?: string;
}

export interface SsmlSynthesisBookmark {
  name: string;
  audioOffsetMs: number;
  textRange?: { start: number; end: number };
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
}

export interface SsmlSynthesisChunk {
  ssml: string;
  originalTextRange?: { start: number; end: number };
}

export interface SynthesizeChunksOptions {
  onProgress?: (event: SynthesisProgressEvent) => void;
}

export interface SynthesisProgressEvent {
  currentChunk: number;
  totalChunks: number;
  percent: number;
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
