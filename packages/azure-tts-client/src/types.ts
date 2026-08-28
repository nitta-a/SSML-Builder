export interface TtsConfig {
  signal?: AbortSignal;
  timeoutMs?: number;
  endpoint?: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
}

export interface SsmlSynthesisBoundary {
  text: string;
  audioOffsetMs: number;
  durationMs: number;
}

export interface SsmlSynthesisViseme {
  visemeId: number;
  audioOffsetMs: number;
}

export interface SsmlSynthesisBookmark {
  name: string;
  audioOffsetMs: number;
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
}
