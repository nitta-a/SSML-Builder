export type SynthesisErrorKind =
  | "validation-error"
  | "azure-api-error"
  | "merge-error"
  | "audio-format-mismatch"
  | "unsupported-format-error"
  | "cancelled"
  | "timeout"
  | "incomplete-chunk-set";

export type SerializedChunkErrorCode =
  | "VALIDATION_ERROR"
  | "AZURE_API_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "MERGE_ERROR"
  | "FORMAT_MISMATCH";

export interface SerializedChunkError {
  code: SerializedChunkErrorCode;
  phase: "url-validation" | "synthesis" | "merge";
  message: string;
  isOriginalFailure: boolean;
  isRetryable: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

/** Backward-compatible name used by persisted execution-state consumers. */
export type SerializedExecutionError = SerializedChunkError;

export class AzureTtsError extends Error {
  readonly kind = "azure-api-error" as const;
  readonly status: number;
  readonly statusText: string;
  readonly responseBody: string;
  readonly requestId: string | null;
  readonly retryAfterMs?: number;

  constructor(
    status: number,
    statusText: string,
    responseBody: string,
    requestId: string | null,
    responseHeaders?: Headers | Readonly<Record<string, string>>,
  ) {
    super(`Azure TTS request failed: ${status} ${statusText}`);
    this.name = "AzureTtsError";
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
    this.requestId = requestId;
    const value =
      responseHeaders instanceof Headers
        ? responseHeaders.get("retry-after")
        : (responseHeaders?.["retry-after"] ?? responseHeaders?.["Retry-After"]);
    const seconds = value ? Number(value.trim()) : NaN;
    const date = value ? Date.parse(value) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) this.retryAfterMs = seconds * 1000;
    else if (Number.isFinite(date)) this.retryAfterMs = Math.max(0, date - Date.now());
  }
}

/** Reads Retry-After from an error-like value, returning milliseconds when present. */
export function getRetryAfterDelayMs(error: unknown): number | undefined {
  if (error instanceof AzureTtsError && error.retryAfterMs !== undefined) return error.retryAfterMs;
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { retryAfterMs?: unknown; headers?: unknown; response?: unknown };
  if (typeof candidate.retryAfterMs === "number" && candidate.retryAfterMs >= 0) return candidate.retryAfterMs;
  const headers = candidate.headers ?? (candidate.response as { headers?: unknown } | undefined)?.headers;
  if (headers instanceof Headers) {
    const value = headers.get("retry-after");
    if (!value) return undefined;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
  }
  if (headers && typeof headers === "object") {
    const value =
      (headers as Record<string, unknown>)["retry-after"] ?? (headers as Record<string, unknown>)["Retry-After"];
    if (typeof value !== "string") return undefined;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
  }
  return undefined;
}

export class AzureTtsSdkError extends AzureTtsError {
  readonly errorDetails: string;

  constructor(errorDetails: string) {
    super(0, "Speech SDK", errorDetails, null);
    this.name = "AzureTtsSdkError";
    this.message = `Azure TTS synthesis failed: ${errorDetails}`;
    this.errorDetails = errorDetails;
  }
}

export class SynthesisCancelledError extends Error {
  readonly kind = "cancelled" as const;

  constructor(message = "Speech synthesis was cancelled.") {
    super(message);
    this.name = "SynthesisCancelledError";
  }
}

export class SynthesisTimeoutError extends Error {
  readonly kind = "timeout" as const;

  constructor(message: string) {
    super(message);
    this.name = "SynthesisTimeoutError";
  }
}

export class IncompleteChunkSetError extends Error {
  readonly kind = "incomplete-chunk-set" as const;
  readonly totalChunks: number;
  readonly missingChunkIndices: readonly number[];

  constructor(totalChunks: number, missingChunkIndices: readonly number[]) {
    super(`Cannot merge an incomplete chunk set; missing chunk indices: ${missingChunkIndices.join(", ")}.`);
    this.name = "IncompleteChunkSetError";
    this.totalChunks = totalChunks;
    this.missingChunkIndices = [...missingChunkIndices];
  }
}

export class MergeError extends Error {
  readonly kind = "merge-error" as const;
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MergeError";
    this.cause = cause;
  }
}

/** Thrown when chunk headers describe incompatible audio streams. */
export class AudioFormatMismatchError extends Error {
  readonly kind = "audio-format-mismatch" as const;
  readonly inputSpecs: readonly AudioSpecification[];

  constructor(message: string, inputSpecs: readonly AudioSpecification[] = []) {
    super(message);
    this.name = "AudioFormatMismatchError";
    this.inputSpecs = inputSpecs;
  }
}

/** Thrown when audio buffers require container re-multiplexing before they can be merged. */
export class UnsupportedMergeFormatError extends Error {
  readonly kind = "unsupported-format-error" as const;
  readonly format: string;

  constructor(format: string) {
    super(`Audio format "${format}" cannot be safely concatenated; container re-multiplexing is required.`);
    this.name = "UnsupportedMergeFormatError";
    this.format = format;
  }
}

export type AzureTtsSynthesisError =
  | AzureTtsError
  | MergeError
  | AudioFormatMismatchError
  | UnsupportedMergeFormatError
  | SynthesisCancelledError
  | SynthesisTimeoutError
  | IncompleteChunkSetError;

export function serializeChunkError(
  error: unknown,
  phase: SerializedChunkError["phase"],
  isOriginalFailure: boolean,
): SerializedChunkError {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof AzureTtsError ? error.status : undefined;
  const kind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "";
  const code: SerializedChunkErrorCode =
    kind === "validation-error"
      ? "VALIDATION_ERROR"
      : kind === "timeout" || /tim(?:e|ed) ?out|deadline/i.test(message)
        ? "TIMEOUT"
        : kind === "cancelled" || /cancel|abort/i.test(message)
          ? "CANCELLED"
          : kind === "audio-format-mismatch" || kind === "unsupported-format-error"
            ? "FORMAT_MISMATCH"
            : kind === "merge-error" || phase === "merge"
              ? "MERGE_ERROR"
              : "AZURE_API_ERROR";
  const details: Record<string, unknown> = {};
  if (error instanceof AzureTtsError) {
    details.statusText = error.statusText;
    if (error.requestId) details.requestId = error.requestId;
  }
  if (error instanceof IncompleteChunkSetError) {
    details.totalChunks = error.totalChunks;
    details.missingChunkIndices = [...error.missingChunkIndices];
  }
  return {
    code,
    phase,
    message,
    isOriginalFailure,
    isRetryable:
      code === "AZURE_API_ERROR" &&
      (status === 429 ||
        (status !== undefined && status >= 500) ||
        /network|connection|connect|socket|fetch failed|econn|etimedout|temporar|transient|unavailable/i.test(message)),
    ...(status !== undefined && status > 0 ? { httpStatus: status } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

export function toSynthesisError(
  error: unknown,
):
  | AzureTtsError
  | MergeError
  | AudioFormatMismatchError
  | UnsupportedMergeFormatError
  | SynthesisCancelledError
  | SynthesisTimeoutError
  | IncompleteChunkSetError {
  if (
    error instanceof AzureTtsError ||
    error instanceof MergeError ||
    error instanceof AudioFormatMismatchError ||
    error instanceof UnsupportedMergeFormatError ||
    error instanceof SynthesisCancelledError ||
    error instanceof SynthesisTimeoutError ||
    error instanceof IncompleteChunkSetError
  )
    return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel|abort/i.test(message)) return new SynthesisCancelledError(message);
  if (/tim(?:e|ed) ?out/i.test(message)) return new SynthesisTimeoutError(message);
  return createSpeechSdkError(error);
}

export function createSpeechSdkError(error: unknown): AzureTtsSdkError {
  const message = error instanceof Error ? error.message : String(error);
  return new AzureTtsSdkError(message);
}
import type { AudioSpecification } from "./types.ts";
