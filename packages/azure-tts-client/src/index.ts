/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export interface TtsConfig {
  endpoint: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
}

export interface AzureTtsClientOptions {
  subscriptionKey: string;
  region: string;
  endpoint?: string;
  outputFormat?: string;
}

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

const DEFAULT_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3";

function resolveEndpoint(config: TtsConfig): string {
  return config.endpoint.replace(
    /\{region\}/g,
    encodeURIComponent(config.region),
  );
}

export async function synthesizeSpeech(
  ssml: string,
  config: TtsConfig,
): Promise<ArrayBuffer> {
  const response = await fetch(resolveEndpoint(config), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": config.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new AzureTtsError(
      response.status,
      response.statusText,
      await response.text(),
      response.headers.get("x-requestid"),
    );
  }

  return response.arrayBuffer();
}

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    return synthesizeSpeech(ssml, {
      endpoint:
        this.#options.endpoint ??
        `https://${this.#options.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      subscriptionKey: this.#options.subscriptionKey,
      region: this.#options.region,
      outputFormat: this.#options.outputFormat,
    });
  }
}
