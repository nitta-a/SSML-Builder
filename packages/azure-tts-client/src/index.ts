/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export interface AzureTtsClientOptions {
  subscriptionKey: string;
  region: string;
}

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    const endpoint = `https://${this.#options.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.#options.subscriptionKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    });

    if (!response.ok) {
      throw new Error(`Azure TTS request failed: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }
}
