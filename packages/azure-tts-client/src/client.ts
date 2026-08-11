import { synthesizeSpeech } from "./synthesis.ts";
import type { AzureTtsClientOptions } from "./types.ts";

const ENDPOINT_TEMPLATE = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1";

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    const { region, subscriptionKey, outputFormat } = this.#options;
    const endpoint = this.#options.endpoint ?? ENDPOINT_TEMPLATE.replace("{region}", region);
    console.debug("Using Azure TTS endpoint:", endpoint);

    const config = { endpoint, region, subscriptionKey, outputFormat };
    return synthesizeSpeech(ssml, config);
  }
}
