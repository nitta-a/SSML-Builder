import { validateAzureSsml, type AzureValidationOptions, type SsmlDiagnostic } from "@ssml-builder-js/ssml-core";
import { AzureTtsError, createSpeechSdkError } from "./errors.ts";
import type { AzureTtsClient } from "./client.ts";
import { mergeSynthesisResults } from "./synthesis.ts";
import type { SsmlSynthesisChunk, SsmlSynthesisResult, SynthesisProgressEvent } from "./types.ts";

export interface SsmlValidationError {
  readonly kind: "validation";
  readonly message: string;
  readonly diagnostics: readonly SsmlDiagnostic[];
}

export class ChunkValidationError extends Error {
  readonly kind = "chunk-validation" as const;
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
  | {
      readonly ok: false;
      readonly success: false;
      readonly status: "validation-error" | "azure-api-error";
      readonly error: E;
    };

export type SynthesisResult<T, E> = Result<T, E>;

export type Success<T> = Extract<Result<T, never>, { readonly ok: true }>;
export type ValidationErrorResult = Extract<
  Result<never, SsmlValidationError>,
  { readonly status: "validation-error" }
>;
export type AzureApiErrorResult = Extract<Result<never, AzureTtsError>, { readonly status: "azure-api-error" }>;

export type SsmlSynthesisSafeResult =
  | Result<SsmlSynthesisResult, never>
  | Result<never, SsmlValidationError>
  | Result<never, AzureTtsError>;

export interface SynthesizeSsmlSafeOptions extends AzureValidationOptions {
  /** Optional nested form for callers that want to keep validation settings grouped. */
  validation?: AzureValidationOptions;
}

export interface SynthesizeSsmlChunksSafeOptions extends AzureValidationOptions {
  validation?: AzureValidationOptions;
  outputFormat?: string;
  onProgress?: (event: SynthesisProgressEvent) => void;
}

export type SsmlSynthesisChunksSafeResult =
  | Result<SsmlSynthesisResult, never>
  | Result<never, ChunkValidationError>
  | Result<never, AzureTtsError>;

interface SynthesisClient {
  synthesizeSsml(ssml: string): Promise<SsmlSynthesisResult>;
  synthesizeChunks?(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options?: { onProgress?: (event: SynthesisProgressEvent) => void },
  ): Promise<SsmlSynthesisResult>;
}

/** Validates SSML before invoking Azure and converts validation/API failures to one result shape. */
export async function synthesizeSsmlSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml"> | SynthesisClient,
  ssml: string,
  options: SynthesizeSsmlSafeOptions = {},
): Promise<SsmlSynthesisSafeResult> {
  const validationOptions = options.validation ?? options;
  const diagnostics = await Promise.resolve(validateAzureSsml(ssml, validationOptions));
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      success: false,
      status: "validation-error",
      error: {
        kind: "validation",
        message: "SSML validation failed; the Azure Speech API was not called.",
        diagnostics: errors,
      },
    };
  }

  try {
    return { ok: true, success: true, status: "success", value: await client.synthesizeSsml(ssml) };
  } catch (error) {
    const azureError = error instanceof AzureTtsError ? error : createSpeechSdkError(error);
    return { ok: false, success: false, status: "azure-api-error", error: azureError };
  }
}

/** Validates every chunk before synthesis and returns a chunk-addressable result. */
export async function synthesizeSsmlChunksSafe(
  client: Pick<AzureTtsClient, "synthesizeSsml" | "synthesizeChunks"> | SynthesisClient,
  chunks: readonly (SsmlSynthesisChunk | string)[],
  options: SynthesizeSsmlChunksSafeOptions = {},
): Promise<SsmlSynthesisChunksSafeResult> {
  const validationOptions = options.validation ?? options;
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
      const diagnostics = await Promise.resolve(validateAzureSsml(ssml, validationOptions));
      return diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    }),
  );
  const firstInvalidIndex = validations.findIndex((diagnostics) => diagnostics.length > 0);
  if (firstInvalidIndex >= 0) {
    const error = new ChunkValidationError(firstInvalidIndex, validations[firstInvalidIndex] ?? []);
    pending(firstInvalidIndex, "failed", error);
    return { ok: false, success: false, status: "validation-error", error };
  }

  try {
    if (client.synthesizeChunks) {
      const value = await client.synthesizeChunks(chunks, { onProgress: options.onProgress });
      return { ok: true, success: true, status: "success", value };
    }
    const results: SsmlSynthesisResult[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const input = typeof chunk === "string" ? { ssml: chunk } : chunk;
      const sourceNodePath = input.sourceNodePath;
      pending(index, "synthesizing");
      const startedAt = Date.now();
      try {
        const result = await client.synthesizeSsml(input.ssml);
        results.push({
          ...result,
          ...(input.originalTextRange ? { textRange: { ...input.originalTextRange } } : {}),
          ...(sourceNodePath
            ? {
                boundaries: result.boundaries?.map((event) => ({
                  ...event,
                  sourceNodePath: [...sourceNodePath],
                })),
                visemes: result.visemes?.map((event) => ({ ...event, sourceNodePath: [...sourceNodePath] })),
                bookmarks: result.bookmarks?.map((event) => ({ ...event, sourceNodePath: [...sourceNodePath] })),
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
      value: mergeSynthesisResults(results, options.outputFormat),
    };
  } catch (error) {
    const azureError = error instanceof AzureTtsError ? error : createSpeechSdkError(error);
    return { ok: false, success: false, status: "azure-api-error", error: azureError };
  }
}
