export type SynthesisErrorKind =
  | "validation-error"
  | "azure-api-error"
  | "merge-error"
  | "unsupported-format-error"
  | "cancelled"
  | "timeout";

export class AzureTtsError extends Error {
  readonly kind = "azure-api-error" as const;
  readonly status: number;
  readonly statusText: string;
  readonly responseBody: string;
  readonly requestId: string | null;

  constructor(status: number, statusText: string, responseBody: string, requestId: string | null) {
    super(`Azure TTS request failed: ${status} ${statusText}`);
    this.name = "AzureTtsError";
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
    this.requestId = requestId;
  }
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

export class MergeError extends Error {
  readonly kind = "merge-error" as const;
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MergeError";
    this.cause = cause;
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
  | UnsupportedMergeFormatError
  | SynthesisCancelledError
  | SynthesisTimeoutError;

export function toSynthesisError(
  error: unknown,
): AzureTtsError | MergeError | UnsupportedMergeFormatError | SynthesisCancelledError | SynthesisTimeoutError {
  if (
    error instanceof AzureTtsError ||
    error instanceof MergeError ||
    error instanceof UnsupportedMergeFormatError ||
    error instanceof SynthesisCancelledError ||
    error instanceof SynthesisTimeoutError
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
