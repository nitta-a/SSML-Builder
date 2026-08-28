import { synthesizeSpeech, synthesizeSsml, synthesizeSsmlChunks } from "./synthesis.ts";
import { synthesizeSsmlSafe } from "./safe.ts";
import type { SynthesizeSsmlSafeOptions } from "./safe.ts";
import type {
  AzureTtsClientOptions,
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  SynthesizeChunksOptions,
} from "./types.ts";

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

  async synthesizeChunks(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options: SynthesizeChunksOptions = {},
  ): Promise<SsmlSynthesisResult> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    return synthesizeSsmlChunks(chunks, {
      endpoint,
      region,
      subscriptionKey,
      outputFormat,
      signal,
      timeoutMs,
      onProgress: options.onProgress ?? this.#options.onProgress,
    });
  }

  async synthesizeSsmlSafe(ssml: string, options: SynthesizeSsmlSafeOptions = {}) {
    return synthesizeSsmlSafe(this, ssml, options);
  }
}
