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
import { computeChunkFingerprint, mergeSynthesisResults } from "./synthesis.ts";
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
  ChunkExecutionState,
  ResumeValidationMode,
} from "./types.ts";
import type { AzureTtsOutputFormat } from "./outputFormats.ts";
import { IncompleteChunkSetError, serializeChunkError } from "./errors.ts";
import { DeadlineController } from "./deadline.ts";

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
  customHeaders?: Readonly<Record<string, string>>;
  fingerprintSchemaVersion?: string;
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
  resumeValidation?: ResumeValidationMode;
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
  deadlineAtMs?: number,
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
      const retryAfterMs = getRetryAfterDelayMs(error);
      const remainingMs = deadlineAtMs === undefined ? undefined : Math.max(0, deadlineAtMs - Date.now());
      if (
        retryAfterMs !== undefined &&
        (retryAfterMs > retry.maxDelayMs || (remainingMs !== undefined && retryAfterMs > remainingMs))
      ) {
        throw new Error("Speech synthesis timed out because Retry-After exceeded the available retry budget.");
      }
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
  const deadline = new DeadlineController(options.timeouts?.totalJobMs, options.signal);
  const validationOptions = sharedValidationOptions(options.validation ?? options, deadline.signal);
  const diagnostics = await Promise.resolve(validateAzureSsml(ssml, validationOptions));
  if (deadline.signal.aborted) {
    const error = toSynthesisError(
      new Error(deadline.timedOut ? "Speech synthesis timed out." : "Speech synthesis was cancelled."),
    );
    deadline.dispose();
    return failure(error);
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    deadline.dispose();
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
        signal: deadline.signal,
        timeoutMs: options.timeouts?.perChunkMs,
        timeouts: options.timeouts ? { ...options.timeouts, totalJobMs: undefined } : undefined,
      }),
    };
  } catch (error) {
    if (deadline.timedOut) return failure(toSynthesisError(new Error("Speech synthesis timed out.")));
    const synthesisError = toSynthesisError(error);
    return failure(synthesisError);
  } finally {
    deadline.dispose();
  }
}

/** Validates every chunk before synthesis and returns a chunk-addressable result. */
export async function synthesizeSsmlChunksSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml" | "synthesizeChunks"> | SynthesisClient,
  chunks: readonly (SsmlSynthesisChunk | string)[],
  options: SynthesizeSsmlChunksSafeOptions = {},
): Promise<SsmlSynthesisChunksSafeResult> {
  const deadline = new DeadlineController(options.timeouts?.totalJobMs, options.signal);
  const validationOptions = sharedValidationOptions(
    { ...(options.validation ?? options), timeouts: options.timeouts },
    deadline.signal,
  );
  if (deadline.signal.aborted) {
    const error = toSynthesisError(
      new Error(deadline.timedOut ? "Speech synthesis timed out." : "Speech synthesis was cancelled."),
    );
    deadline.dispose();
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
  if (deadline.signal.aborted) {
    const error = toSynthesisError(new Error("Speech synthesis was cancelled."));
    deadline.dispose();
    return failure(error);
  }
  const chunkDiagnostics = validations
    .map((diagnostics, chunkIndex) => ({ chunkIndex, diagnostics }))
    .filter((entry) => entry.diagnostics.length > 0);
  if (chunkDiagnostics.length > 0) {
    const error = new BatchChunkValidationError(chunkDiagnostics);
    for (const entry of chunkDiagnostics) pending(entry.chunkIndex, "failed", error);
    deadline.dispose();
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
        signal: deadline.signal,
        timeoutMs: options.timeoutMs,
        timeouts: options.timeouts ? { ...options.timeouts, totalJobMs: undefined } : undefined,
        sourceNodePath: options.sourceNodePath,
        concurrency: options.concurrency,
        retryOptions: options.retryOptions,
        cancelOnFailure: options.cancelOnFailure,
        resumeChunks: options.resumeChunks,
        resumeChunkIndices: options.resumeChunkIndices,
        customMerger: options.customMerger,
        outputMimeType: options.outputMimeType,
        postMergeValidator: options.postMergeValidator,
        resumeValidation: options.resumeValidation,
        customHeaders: options.customHeaders,
        fingerprintSchemaVersion: options.fingerprintSchemaVersion,
      });
      return { ok: true, success: true, status: "success", value };
    }
    const inputs = chunks.map((chunk) => (typeof chunk === "string" ? { ssml: chunk } : chunk));
    const fingerprints = inputs.map((chunk) =>
      computeChunkFingerprint(chunk.ssml, options.outputFormat, {
        customHeaders: options.customHeaders,
        fingerprintSchemaVersion: options.fingerprintSchemaVersion,
      }),
    );
    const results: Array<SsmlSynthesisResult | undefined> = new Array(chunks.length);
    const chunkStates: ChunkExecutionState[] = inputs.map((_chunk, chunkIndex) => ({
      chunkIndex,
      status: "pending",
      canResume: true,
    }));
    const cachedChunks = new Map((options.resumeChunks ?? []).map((chunk) => [chunk.chunkIndex, chunk]));
    const invalidCachedIndices = new Set<number>();
    for (const [index, cached] of cachedChunks) {
      if (index < 0 || index >= chunks.length) continue;
      if (options.resumeValidation === "disabled" || cached.fingerprint === fingerprints[index]) {
        results[index] = cached;
        chunkStates[index] = { chunkIndex: index, status: "succeeded", canResume: true, result: cached };
      } else invalidCachedIndices.add(index);
    }
    const requestedIndices = options.resumeChunkIndices
      ? new Set(options.resumeChunkIndices.filter((index) => index >= 0 && index < chunks.length))
      : undefined;
    const shouldSynthesize = (index: number): boolean =>
      (!cachedChunks.has(index) || invalidCachedIndices.has(index)) &&
      (requestedIndices === undefined || requestedIndices.has(index) || invalidCachedIndices.has(index));
    const jobDeadlineAt = deadline.deadlineAtMs;
    const jobScope =
      chunks.length > 1 || options.timeouts?.totalJobMs !== undefined
        ? createSafeAbortScope(deadline.signal, undefined)
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
        if (firstError && options.cancelOnFailure !== false) {
          chunkStates[index] = { chunkIndex: index, status: "cancelled", isOriginalFailure: false, canResume: true };
          return;
        }
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
              ? createSafeAbortScope(jobScope?.signal ?? deadline.signal, chunkTimeout ?? options.timeoutMs)
              : undefined;
          const chunkSignal = chunkScope?.signal ?? deadline.signal;
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
              jobDeadlineAt,
            );
          } catch (error) {
            if (chunkScope?.timedOut() || deadline.timedOut)
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
          chunkStates[index] = { chunkIndex: index, status: "succeeded", canResume: true, result: results[index] };
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
          const wasCancelled =
            firstError !== undefined ||
            (!deadline.timedOut && Boolean(jobScope?.signal.aborted && !jobScope?.timedOut()));
          firstError ??= deadline.timedOut ? new Error("Speech synthesis timed out.") : error;
          if (!wasCancelled) failedIndices.add(index);
          chunkStates[index] = {
            chunkIndex: index,
            status: wasCancelled ? "cancelled" : "failed",
            isOriginalFailure: !wasCancelled,
            canResume: true,
            error: serializeChunkError(error, "synthesis", !wasCancelled),
          };
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
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()));
    if (firstError && options.cancelOnFailure !== false) {
      for (const [chunkIndex, state] of chunkStates.entries()) {
        if (state.status === "pending" && shouldSynthesize(chunkIndex)) {
          chunkStates[chunkIndex] = { chunkIndex, status: "cancelled", isOriginalFailure: false, canResume: true };
        }
      }
    }
    if (failedIndices.size > 0) {
      const error = firstError ?? new Error("One or more SSML chunks failed to synthesize.");
      const synthesizedChunks = results.flatMap((result, chunkIndex) =>
        result ? [{ ...result, chunkIndex, fingerprint: fingerprints[chunkIndex] ?? "" }] : [],
      );
      (error as { partialResult?: PartialChunkSynthesisResult }).partialResult = {
        synthesizedChunks,
        completedChunks: synthesizedChunks,
        pendingChunkIndices: chunkStates.flatMap((state) =>
          state.status === "pending" || state.status === "cancelled" || state.status === "failed"
            ? [state.chunkIndex]
            : [],
        ),
        failedChunkIndices: [...failedIndices],
        cancelledChunkIndices: chunkStates
          .filter((state) => state.status === "cancelled")
          .map((state) => state.chunkIndex),
        chunkStates,
        totalChunks: chunks.length,
      };
      throw error;
    }
    const missingChunkIndices = Array.from({ length: chunks.length }, (_value, index) =>
      results[index] === undefined ? index : undefined,
    ).filter((index): index is number => index !== undefined);
    if (missingChunkIndices.length > 0) throw new IncompleteChunkSetError(chunks.length, missingChunkIndices);
    const orderedResults = results.filter((result): result is SsmlSynthesisResult => result !== undefined);
    return {
      ok: true,
      success: true,
      status: "success",
      value: await mergeSynthesisResults(orderedResults, {
        format: (options.outputFormat ?? "audio-16khz-128kbitrate-mono-mp3") as AzureTtsOutputFormat,
        signal: jobScope?.signal ?? deadline.signal,
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
    deadline.dispose();
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
