export class AzureTtsError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly responseBody: string;
  readonly requestId: string | null;

  constructor(
    status: number,
    statusText: string,
    responseBody: string,
    requestId: string | null,
  ) {
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

export function createSpeechSdkError(error: unknown): AzureTtsSdkError {
  const message = error instanceof Error ? error.message : String(error);
  return new AzureTtsSdkError(message);
}
