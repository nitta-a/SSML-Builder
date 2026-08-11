import { synthesizeSpeech } from "./synthesis";
import type { AzureTtsClientOptions } from "./types";

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
