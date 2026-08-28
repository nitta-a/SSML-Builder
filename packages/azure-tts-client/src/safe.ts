import { validateAzureSsml, type AzureValidationOptions, type SsmlDiagnostic } from "@ssml-builder-js/ssml-core";
import { AzureTtsError, createSpeechSdkError } from "./errors.ts";
import type { AzureTtsClient } from "./client.ts";
import type { SsmlSynthesisResult } from "./types.ts";

export interface SsmlValidationError {
  readonly kind: "validation";
  readonly message: string;
  readonly diagnostics: readonly SsmlDiagnostic[];
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

interface SynthesisClient {
  synthesizeSsml(ssml: string): Promise<SsmlSynthesisResult>;
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
