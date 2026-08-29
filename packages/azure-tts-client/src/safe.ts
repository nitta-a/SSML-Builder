import { validateAzureSsml, type AzureValidationOptions, type SsmlDiagnostic } from "@ssml-builder-js/ssml-core";
import {
  type AzureTtsError,
  type AzureTtsSynthesisError,
  type SynthesisErrorKind,
  toSynthesisError,
} from "./errors.ts";
import type { AzureTtsClient } from "./client.ts";
import { mergeSynthesisResults } from "./synthesis.ts";
import type {
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  SynthesisProgressEvent,
  SynthesizeChunksOptions,
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

export type Result<T, E> =
  | { readonly ok: true; readonly success: true; readonly status: "success"; readonly value: T }
  | (E extends { readonly kind: infer Kind extends SynthesisErrorKind }
      ? {
          readonly ok: false;
          readonly success: false;
          readonly status: Kind;
          readonly error: E;
        }
      : {
          readonly ok: false;
          readonly success: false;
          readonly status: SynthesisErrorKind;
          readonly error: E;
        });

export type SynthesisResult<T, E> = Result<T, E>;

function failure<E extends { readonly kind: SynthesisErrorKind }>(error: E): Result<never, E> {
  return { ok: false, success: false, status: error.kind, error } as Result<never, E>;
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
}

export interface SynthesizeSsmlChunksSafeOptions extends AzureValidationOptions {
  validation?: AzureValidationOptions;
  outputFormat?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  sourceNodePath?: string[];
  onProgress?: (event: SynthesisProgressEvent) => void;
}

export type SsmlSynthesisChunksSafeResult =
  | Result<SsmlSynthesisResult, never>
  | Result<never, ChunkValidationError>
  | Result<never, SsmlSynthesisError | ChunkValidationError>;

interface SynthesisClient {
  synthesizeSsml(ssml: string, options?: Partial<SynthesizeChunksOptions>): Promise<SsmlSynthesisResult>;
  synthesizeChunks?(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options?: SynthesizeChunksOptions,
  ): Promise<SsmlSynthesisResult>;
}

/** Validates SSML before invoking Azure and converts validation/API failures to one result shape. */
export async function synthesizeSsmlSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml"> | SynthesisClient,
  ssml: string,
  options: SynthesizeSsmlSafeOptions = {},
): Promise<SsmlSynthesisSafeResult> {
  const validationOptions = withValidationSignal(options.validation ?? options, options.signal);
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
      value: await client.synthesizeSsml(ssml, { signal: options.signal }),
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
  const validationOptions = withValidationSignal(options.validation ?? options, options.signal);
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
    chunks.map(async (chunk) => {
      const ssml = typeof chunk === "string" ? chunk : chunk.ssml;
      const sourceNodePath =
        typeof chunk === "string" ? options.sourceNodePath : (chunk.sourceNodePath ?? options.sourceNodePath);
      const diagnostics = await Promise.resolve(
        validateAzureSsml(ssml, { ...validationOptions, ...(sourceNodePath ? { sourceNodePath } : {}) }),
      );
      return diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    }),
  );
  const firstInvalidIndex = validations.findIndex((diagnostics) => diagnostics.length > 0);
  if (firstInvalidIndex >= 0) {
    const error = new ChunkValidationError(firstInvalidIndex, validations[firstInvalidIndex] ?? []);
    pending(firstInvalidIndex, "failed", error);
    return failure(error);
  }

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
        sourceNodePath: options.sourceNodePath,
      });
      return { ok: true, success: true, status: "success", value };
    }
    const results: SsmlSynthesisResult[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
      const sourceNodePath = input.sourceNodePath;
      const originalTextRange = input.originalTextRange;
      pending(index, "synthesizing");
      const startedAt = Date.now();
      try {
        const result = await client.synthesizeSsml(input.ssml, {
          outputFormat: options.outputFormat,
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          sourceNodePath: input.sourceNodePath ?? options.sourceNodePath,
        });
        results.push({
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
        });
        options.onProgress?.({
          currentChunk: index + 1,
          totalChunks: chunks.length,
          percent: chunks.length === 0 ? 100 : Math.round(((index + 1) / chunks.length) * 100),
          chunkIndex: index,
          originalTextRange: input.originalTextRange,
          status: "success",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        options.onProgress?.({
          currentChunk: index,
          totalChunks: chunks.length,
          percent: chunks.length === 0 ? 100 : Math.round((index / chunks.length) * 100),
          chunkIndex: index,
          originalTextRange: input.originalTextRange,
          status: "failed",
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    }
    return {
      ok: true,
      success: true,
      status: "success",
      value: mergeSynthesisResults(results, {
        format: (options.outputFormat ?? "audio-16khz-128kbitrate-mono-mp3") as AzureTtsOutputFormat,
      }),
    };
  } catch (error) {
    const synthesisError = toSynthesisError(error);
    return failure(synthesisError);
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
