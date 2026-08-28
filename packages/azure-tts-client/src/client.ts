import { synthesizeSpeech, synthesizeSsml } from "./synthesis.ts";
import type { AzureTtsClientOptions, SsmlSynthesisResult } from "./types.ts";

const ENDPOINT_TEMPLATE = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1";

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    this.#options.logger?.debug?.("Using Azure TTS endpoint:", endpoint);

    const config = { endpoint, region, subscriptionKey, outputFormat, signal, timeoutMs };
    return synthesizeSpeech(ssml, config);
  }

  async synthesizeSsml(ssml: string): Promise<SsmlSynthesisResult> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    this.#options.logger?.debug?.("Using Azure TTS endpoint:", endpoint);

    return synthesizeSsml(ssml, { endpoint, region, subscriptionKey, outputFormat, signal, timeoutMs });
  }
}
