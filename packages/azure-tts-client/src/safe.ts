import {
  createAzureUrlValidatorRunner,
  validateAzureSsml,
  type AzureUrlValidator,
  type AzureValidationOptions,
  type SsmlDiagnostic,
} from "@ssml-builder-js/ssml-core";
import {
  type AzureTtsError,
  type AzureTtsSynthesisError,
  type SynthesisErrorKind,
  toSynthesisError,
  getRetryAfterDelayMs,
} from "./errors.ts";
import type { AzureTtsClient } from "./client.ts";
import { mergeSynthesisResults } from "./synthesis.ts";
import type {
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  SynthesisProgressEvent,
  SynthesizeChunksOptions,
  RetryOptions,
  SynthesisTimeouts,
  SynthesizedChunk,
  PartialChunkSynthesisResult,
  CustomAudioMerger,
  PostMergeValidator,
} from "./types.ts";
import type { AzureTtsOutputFormat } from "./outputFormats.ts";

export interface SsmlValidationError {
  readonly kind: "validation-error";
  readonly message: string;
  readonly diagnostics: readonly SsmlDiagnostic[];
}

export type SsmlSynthesisError = SsmlValidationError | AzureTtsSynthesisError;

export class ChunkValidationError extends Error {
  readonly kind = "validation-error" as const;
  readonly chunkIndex: number;
  readonly diagnostics: readonly SsmlDiagnostic[];

  constructor(chunkIndex: number, diagnostics: readonly SsmlDiagnostic[]) {
    super(`SSML validation failed for chunk ${chunkIndex}; the Azure Speech API was not called.`);
    this.name = "ChunkValidationError";
    this.chunkIndex = chunkIndex;
    this.diagnostics = diagnostics;
  }
}

export interface ChunkDiagnostics {
  readonly chunkIndex: number;
  readonly diagnostics: readonly SsmlDiagnostic[];
}

export class BatchChunkValidationError extends ChunkValidationError {
  readonly chunkDiagnostics: readonly ChunkDiagnostics[];
  readonly totalErrorCount: number;
  readonly errorCount: number;
  readonly totalErrors: number;

  constructor(chunkDiagnostics: readonly ChunkDiagnostics[]) {
    const first = chunkDiagnostics[0];
    super(first?.chunkIndex ?? -1, first?.diagnostics ?? []);
    this.name = "BatchChunkValidationError";
    this.message = `SSML validation failed for ${chunkDiagnostics.length} chunk(s); the Azure Speech API was not called.`;
    this.chunkDiagnostics = chunkDiagnostics;
    this.totalErrorCount = chunkDiagnostics.reduce((total, chunk) => total + chunk.diagnostics.length, 0);
    this.errorCount = this.totalErrorCount;
    this.totalErrors = this.totalErrorCount;
  }
}

export type Result<T, E> =
  | { readonly ok: true; readonly success: true; readonly status: "success"; readonly value: T }
  | (E extends { readonly kind: infer Kind extends SynthesisErrorKind }
      ? {
          readonly ok: false;
          readonly success: false;
          readonly status: Kind;
          readonly error: E;
          readonly partialResult?: PartialChunkSynthesisResult;
        }
      : {
          readonly ok: false;
          readonly success: false;
          readonly status: SynthesisErrorKind;
          readonly error: E;
          readonly partialResult?: PartialChunkSynthesisResult;
        });

export type SynthesisResult<T, E> = Result<T, E>;

function failure<E extends { readonly kind: SynthesisErrorKind }>(
  error: E,
  partialResult?: PartialChunkSynthesisResult,
): Result<never, E> {
  return {
    ok: false,
    success: false,
    status: error.kind,
    error,
    ...(partialResult ? { partialResult } : {}),
  } as Result<never, E>;
}

export type Success<T> = Extract<Result<T, never>, { readonly ok: true }>;
export type ValidationErrorResult = Extract<
  Result<never, SsmlValidationError>,
  { readonly status: "validation-error" }
>;
export type AzureApiErrorResult = Extract<Result<never, AzureTtsError>, { readonly status: "azure-api-error" }>;

export type SsmlSynthesisSafeResult =
  | Result<SsmlSynthesisResult, never>
  | Result<never, SsmlValidationError>
  | Result<never, SsmlSynthesisError>;

export interface SynthesizeSsmlSafeOptions extends AzureValidationOptions {
  /** Optional nested form for callers that want to keep validation settings grouped. */
  validation?: AzureValidationOptions;
  signal?: AbortSignal;
  timeouts?: SynthesisTimeouts;
}

export interface SynthesizeSsmlChunksSafeOptions extends AzureValidationOptions {
  validation?: AzureValidationOptions;
  outputFormat?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeouts?: SynthesisTimeouts;
  sourceNodePath?: string[];
  onProgress?: (event: SynthesisProgressEvent) => void;
  concurrency?: number;
  retryOptions?: RetryOptions;
  cancelOnFailure?: boolean;
  resumeChunks?: readonly SynthesizedChunk[];
  resumeChunkIndices?: readonly number[];
  customMerger?: CustomAudioMerger;
  outputMimeType?: string;
  postMergeValidator?: PostMergeValidator;
}

export type SsmlSynthesisChunksSafeResult =
  | Result<SsmlSynthesisResult, never>
  | Result<never, ChunkValidationError>
  | Result<never, BatchChunkValidationError>
  | Result<never, SsmlSynthesisError | ChunkValidationError>;

interface SynthesisClient {
  synthesizeSsml(ssml: string, options?: Partial<SynthesizeChunksOptions>): Promise<SsmlSynthesisResult>;
  synthesizeChunks?(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options?: SynthesizeChunksOptions,
  ): Promise<SsmlSynthesisResult>;
}

function partialResultFrom(error: unknown): PartialChunkSynthesisResult | undefined {
  if (!error || typeof error !== "object") return undefined;
  const partial = (error as { partialResult?: unknown }).partialResult;
  if (!partial || typeof partial !== "object") return undefined;
  return partial as PartialChunkSynthesisResult;
}

interface SafeAbortScope {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
  abort: () => void;
}

function createSafeAbortScope(parent: AbortSignal | undefined, timeoutMs: number | undefined): SafeAbortScope {
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

function isRetryable(error: unknown): boolean {
  if (error instanceof Error && /cancel|abort|tim(?:e|ed) ?out/i.test(error.message)) return false;
  const status =
    error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined;
  if (typeof status === "number" && status !== 0) return status === 429 || (status >= 500 && status < 600);
  const message = error instanceof Error ? error.message : String(error);
  if (/\b4\d{2}\b/.test(message)) return false;
  return /network|connection|connect|socket|fetch failed|econn|etimedout|temporar|transient|unavailable/i.test(message);
}

function delayForRetry(options: RetryOptions, attempt: number): number {
  const maxDelay = Math.max(0, options.maxDelayMs);
  const base = Math.min(maxDelay, Math.max(0, options.initialDelayMs) * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * (base + 1));
}

function retryDelayForError(options: RetryOptions, attempt: number, error: unknown): number {
  return getRetryAfterDelayMs(error) ?? delayForRetry(options, attempt);
}

function resolveConcurrency(value: number | undefined, total: number): number {
  if (value === undefined) return 1;
  if (value === Infinity) return Math.max(1, total);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

async function retryableSynthesis(
  synthesize: () => Promise<SsmlSynthesisResult>,
  options: RetryOptions | undefined,
  signal: AbortSignal | undefined,
  onRetry: (attempt: number, delayMs: number) => void,
): Promise<SsmlSynthesisResult> {
  const retry = options
    ? {
        maxRetries: Math.max(0, Math.floor(options.maxRetries)),
        initialDelayMs: options.initialDelayMs,
        maxDelayMs: options.maxDelayMs,
        shouldRetry: options.shouldRetry,
      }
    : undefined;
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new Error("Speech synthesis was cancelled.");
    try {
      return await synthesize();
    } catch (error) {
      if (!retry || attempt >= retry.maxRetries || !(retry.shouldRetry?.(error, attempt + 1) ?? isRetryable(error)))
        throw error;
      attempt += 1;
      const delayMs = retryDelayForError(retry, attempt, error);
      onRetry(attempt, delayMs);
      if (delayMs > 0)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
          }, delayMs);
          const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            reject(new Error("Speech synthesis was cancelled."));
          };
          signal?.addEventListener("abort", abort, { once: true });
        });
    }
  }
}

function sharedValidationOptions(
  options: AzureValidationOptions & { timeouts?: SynthesisTimeouts },
  signal?: AbortSignal,
): AzureValidationOptions {
  const validator = options.urlValidator ?? options.customUrlValidator;
  if (!validator) return signal ? withValidationSignal(options, signal) : options;
  const runner = createAzureUrlValidatorRunner(validator as AzureUrlValidator, {
    ...(options.urlValidation ?? {}),
    ...(options.urlValidatorConcurrency !== undefined ? { concurrency: options.urlValidatorConcurrency } : {}),
    ...(options.timeouts?.urlValidationMs !== undefined
      ? { timeoutMs: options.timeouts.urlValidationMs }
      : options.urlValidatorTimeoutMs !== undefined
        ? { timeoutMs: options.urlValidatorTimeoutMs }
        : {}),
    ...(signal ? { signal } : {}),
    ...(options.urlValidatorCache ? { cache: options.urlValidatorCache } : {}),
  });
  return {
    ...withValidationSignal(options, signal),
    urlValidatorRunner: runner,
  };
}

/** Validates SSML before invoking Azure and converts validation/API failures to one result shape. */
export async function synthesizeSsmlSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml"> | SynthesisClient,
  ssml: string,
  options: SynthesizeSsmlSafeOptions = {},
): Promise<SsmlSynthesisSafeResult> {
  const validationOptions = sharedValidationOptions(options.validation ?? options, options.signal);
  const diagnostics = await Promise.resolve(validateAzureSsml(ssml, validationOptions));
  if (options.signal?.aborted) {
    const error = toSynthesisError(new Error("Speech synthesis was cancelled."));
    return failure(error);
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    return failure({
      kind: "validation-error",
      message: "SSML validation failed; the Azure Speech API was not called.",
      diagnostics: errors,
    });
  }

  try {
    return {
      ok: true,
      success: true,
      status: "success",
      value: await client.synthesizeSsml(ssml, {
        signal: options.signal,
        timeoutMs: options.timeouts?.perChunkMs,
        timeouts: options.timeouts,
      }),
    };
  } catch (error) {
    const synthesisError = toSynthesisError(error);
    return failure(synthesisError);
  }
}

/** Validates every chunk before synthesis and returns a chunk-addressable result. */
export async function synthesizeSsmlChunksSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml" | "synthesizeChunks"> | SynthesisClient,
  chunks: readonly (SsmlSynthesisChunk | string)[],
  options: SynthesizeSsmlChunksSafeOptions = {},
): Promise<SsmlSynthesisChunksSafeResult> {
  const validationOptions = sharedValidationOptions(
    { ...(options.validation ?? options), timeouts: options.timeouts },
    options.signal,
  );
  if (options.signal?.aborted) {
    const error = toSynthesisError(new Error("Speech synthesis was cancelled."));
    return failure(error);
  }
  const pending = (index: number, status: SynthesisProgressEvent["status"], error?: unknown): void => {
    options.onProgress?.({
      currentChunk: status === "success" ? index + 1 : index,
      totalChunks: chunks.length,
      percent:
        chunks.length === 0 ? 100 : Math.round(((status === "success" ? index + 1 : index) / chunks.length) * 100),
      chunkIndex: index,
      originalTextRange: typeof chunks[index] === "string" ? undefined : chunks[index]?.originalTextRange,
      status,
      durationMs: 0,
      ...(error ? { error } : {}),
    });
  };
  chunks.forEach((_chunk, index) => {
    pending(index, "pending");
  });
  const validations = await Promise.all(
    chunks.map(async (chunk, index) => {
      const ssml = typeof chunk === "string" ? chunk : chunk.ssml;
      const sourceNodePath =
        typeof chunk === "string" ? options.sourceNodePath : (chunk.sourceNodePath ?? options.sourceNodePath);
      const diagnostics = await Promise.resolve(
        validateAzureSsml(ssml, {
          ...validationOptions,
          ...(sourceNodePath ? { sourceNodePath } : {}),
          chunkIndex: index,
        }),
      );
      return diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    }),
  );
  if (options.signal?.aborted) {
    const error = toSynthesisError(new Error("Speech synthesis was cancelled."));
    return failure(error);
  }
  const chunkDiagnostics = validations
    .map((diagnostics, chunkIndex) => ({ chunkIndex, diagnostics }))
    .filter((entry) => entry.diagnostics.length > 0);
  if (chunkDiagnostics.length > 0) {
    const error = new BatchChunkValidationError(chunkDiagnostics);
    for (const entry of chunkDiagnostics) pending(entry.chunkIndex, "failed", error);
    return failure(error);
  }

  let fallbackJobScope: SafeAbortScope | undefined;
  try {
    if (client.synthesizeChunks) {
      const normalizedChunks = chunks.map((chunk) => {
        if (typeof chunk === "string" || chunk.sourceNodePath || !options.sourceNodePath) return chunk;
        return { ...chunk, sourceNodePath: [...options.sourceNodePath] };
      });
      const value = await client.synthesizeChunks(normalizedChunks, {
        onProgress: options.onProgress,
        outputFormat: options.outputFormat,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        timeouts: options.timeouts,
        sourceNodePath: options.sourceNodePath,
        concurrency: options.concurrency,
        retryOptions: options.retryOptions,
        cancelOnFailure: options.cancelOnFailure,
        resumeChunks: options.resumeChunks,
        resumeChunkIndices: options.resumeChunkIndices,
        customMerger: options.customMerger,
        outputMimeType: options.outputMimeType,
        postMergeValidator: options.postMergeValidator,
      });
      return { ok: true, success: true, status: "success", value };
    }
    const results: Array<SsmlSynthesisResult | undefined> = new Array(chunks.length);
    const cachedChunks = new Map((options.resumeChunks ?? []).map((chunk) => [chunk.chunkIndex, chunk]));
    for (const [index, cached] of cachedChunks) {
      if (index >= 0 && index < chunks.length) results[index] = cached;
    }
    const requestedIndices = options.resumeChunkIndices
      ? new Set(options.resumeChunkIndices.filter((index) => index >= 0 && index < chunks.length))
      : undefined;
    const shouldSynthesize = (index: number): boolean =>
      !cachedChunks.has(index) && (requestedIndices === undefined || requestedIndices.has(index));
    const jobScope =
      chunks.length > 1 || options.timeouts?.totalJobMs !== undefined
        ? createSafeAbortScope(options.signal, options.timeouts?.totalJobMs)
        : undefined;
    fallbackJobScope = jobScope;
    const failedIndices = new Set<number>();
    let firstError: unknown;
    let completed = [...results].filter((result) => result !== undefined).length;
    let nextIndex = 0;
    const concurrency = resolveConcurrency(options.concurrency, chunks.length);
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;
        if (index >= chunks.length) return;
        if (!shouldSynthesize(index)) continue;
        if (failedIndices.size > 0 && options.cancelOnFailure !== false) return;
        const chunk = chunks[index];
        const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
        const sourceNodePath = input.sourceNodePath;
        const originalTextRange = input.originalTextRange;
        pending(index, "synthesizing");
        const startedAt = Date.now();
        try {
          const chunkTimeout = options.timeouts?.chunkWithRetriesMs ?? options.timeouts?.perChunkMs;
          const chunkScope =
            chunkTimeout !== undefined || jobScope
              ? createSafeAbortScope(jobScope?.signal ?? options.signal, chunkTimeout ?? options.timeoutMs)
              : undefined;
          const chunkSignal = chunkScope?.signal ?? options.signal;
          let result: SsmlSynthesisResult;
          try {
            result = await retryableSynthesis(
              () =>
                client.synthesizeSsml(input.ssml, {
                  outputFormat: options.outputFormat,
                  signal: chunkSignal,
                  timeoutMs: options.timeouts?.perChunkMs ?? options.timeoutMs,
                  sourceNodePath: input.sourceNodePath ?? options.sourceNodePath,
                }),
              options.retryOptions,
              chunkSignal,
              (retryAttempt, nextRetryDelayMs) =>
                options.onProgress?.({
                  currentChunk: completed,
                  totalChunks: chunks.length,
                  percent: chunks.length === 0 ? 100 : Math.round((completed / chunks.length) * 100),
                  chunkIndex: index,
                  originalTextRange: input.originalTextRange,
                  status: "synthesizing",
                  durationMs: Date.now() - startedAt,
                  retryAttempt,
                  nextRetryDelayMs,
                  isRetrying: true,
                }),
            );
          } catch (error) {
            if (chunkScope?.timedOut())
              throw new Error(`Speech synthesis timed out after ${chunkTimeout ?? options.timeoutMs} ms.`);
            throw error;
          } finally {
            chunkScope?.dispose();
          }
          results[index] = {
            ...result,
            ...(input.originalTextRange ? { textRange: { ...input.originalTextRange } } : {}),
            ...(sourceNodePath
              ? {
                  boundaries: result.boundaries?.map((event) => ({
                    ...event,
                    sourceNodePath: [...sourceNodePath],
                    ...(event.originalTextRange
                      ? { originalTextRange: { ...event.originalTextRange } }
                      : input.originalTextRange
                        ? { originalTextRange: { ...input.originalTextRange } }
                        : {}),
                  })),
                  visemes: result.visemes?.map((event) => ({
                    ...event,
                    sourceNodePath: [...sourceNodePath],
                    ...(event.originalTextRange
                      ? { originalTextRange: { ...event.originalTextRange } }
                      : input.originalTextRange
                        ? { originalTextRange: { ...input.originalTextRange } }
                        : {}),
                  })),
                  bookmarks: result.bookmarks?.map((event) => ({
                    ...event,
                    sourceNodePath: [...sourceNodePath],
                    ...(event.originalTextRange
                      ? { originalTextRange: { ...event.originalTextRange } }
                      : input.originalTextRange
                        ? { originalTextRange: { ...input.originalTextRange } }
                        : {}),
                  })),
                }
              : {}),
            ...(originalTextRange
              ? {
                  boundaries: result.boundaries?.map((event) => ({
                    ...event,
                    originalTextRange: event.originalTextRange
                      ? { ...event.originalTextRange }
                      : { ...originalTextRange },
                  })),
                  wordBoundary: result.wordBoundary?.map((event) => ({
                    ...event,
                    originalTextRange: event.originalTextRange
                      ? { ...event.originalTextRange }
                      : { ...originalTextRange },
                  })),
                  wordBoundaries: result.wordBoundaries?.map((event) => ({
                    ...event,
                    originalTextRange: event.originalTextRange
                      ? { ...event.originalTextRange }
                      : { ...originalTextRange },
                  })),
                  visemes: result.visemes?.map((event) => ({
                    ...event,
                    originalTextRange: event.originalTextRange
                      ? { ...event.originalTextRange }
                      : { ...originalTextRange },
                  })),
                  bookmarks: result.bookmarks?.map((event) => ({
                    ...event,
                    originalTextRange: event.originalTextRange
                      ? { ...event.originalTextRange }
                      : { ...originalTextRange },
                  })),
                }
              : {}),
          };
          completed += 1;
          options.onProgress?.({
            currentChunk: completed,
            totalChunks: chunks.length,
            percent: chunks.length === 0 ? 100 : Math.round((completed / chunks.length) * 100),
            chunkIndex: index,
            originalTextRange: input.originalTextRange,
            status: "success",
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          failedIndices.add(index);
          options.onProgress?.({
            currentChunk: completed,
            totalChunks: chunks.length,
            percent: chunks.length === 0 ? 100 : Math.round((index / chunks.length) * 100),
            chunkIndex: index,
            originalTextRange: input.originalTextRange,
            status: "failed",
            durationMs: Date.now() - startedAt,
            error,
          });
          if (options.cancelOnFailure !== false) jobScope?.abort();
          firstError ??= error;
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()));
    if (failedIndices.size > 0) {
      const error = firstError ?? new Error("One or more SSML chunks failed to synthesize.");
      (error as { partialResult?: PartialChunkSynthesisResult }).partialResult = {
        synthesizedChunks: results.flatMap((result, chunkIndex) => (result ? [{ ...result, chunkIndex }] : [])),
        completedChunks: results.flatMap((result, chunkIndex) => (result ? [{ ...result, chunkIndex }] : [])),
        pendingChunkIndices: chunks.flatMap((_chunk, chunkIndex) => (results[chunkIndex] ? [] : [chunkIndex])),
        failedChunkIndices: [...failedIndices],
        totalChunks: chunks.length,
      };
      throw error;
    }
    const orderedResults = results.filter((result): result is SsmlSynthesisResult => result !== undefined);
    return {
      ok: true,
      success: true,
      status: "success",
      value: await mergeSynthesisResults(orderedResults, {
        format: (options.outputFormat ?? "audio-16khz-128kbitrate-mono-mp3") as AzureTtsOutputFormat,
        signal: jobScope?.signal ?? options.signal,
        customMerger: options.customMerger,
        outputMimeType: options.outputMimeType,
        postMergeValidator: options.postMergeValidator,
      }),
    };
  } catch (error) {
    const synthesisError = toSynthesisError(error);
    return failure(synthesisError, partialResultFrom(error));
  } finally {
    fallbackJobScope?.dispose();
  }
}

function withValidationSignal(options: AzureValidationOptions, signal?: AbortSignal): AzureValidationOptions {
  if (!signal) return options;
  return {
    ...options,
    urlValidatorSignal: signal,
    urlValidation: { ...(options.urlValidation ?? {}), signal },
  };
}
