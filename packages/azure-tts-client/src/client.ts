import { synthesizeSpeech, synthesizeSsml, synthesizeSsmlChunks } from "./synthesis.ts";
import { synthesizeSsmlChunksSafe, synthesizeSsmlSafe } from "./safe.ts";
import type { SynthesizeSsmlChunksSafeOptions, SynthesizeSsmlSafeOptions } from "./safe.ts";
import type {
  AzureTtsClientOptions,
  SsmlSynthesisChunk,
  SsmlSynthesisResult,
  SynthesizeChunksOptions,
  TtsConfig,
} from "./types.ts";

const ENDPOINT_TEMPLATE = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1";

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs, timeouts } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    this.#options.logger?.debug?.("Using Azure TTS endpoint:", endpoint);

    const config = {
      endpoint,
      region,
      subscriptionKey,
      outputFormat,
      signal,
      timeoutMs,
      timeouts,
      retryOptions: this.#options.retryOptions,
    };
    return synthesizeSpeech(ssml, config);
  }

  async synthesizeSsml(ssml: string, options: Partial<TtsConfig> = {}): Promise<SsmlSynthesisResult> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs, timeouts } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    this.#options.logger?.debug?.("Using Azure TTS endpoint:", endpoint);

    return synthesizeSsml(ssml, {
      endpoint,
      region,
      subscriptionKey,
      outputFormat: options.outputFormat ?? outputFormat,
      signal: options.signal ?? signal,
      timeoutMs: options.timeoutMs ?? timeoutMs,
      timeouts: options.timeouts ?? timeouts,
      sourceNodePath: options.sourceNodePath,
      sourceTextSegments: options.sourceTextSegments,
      sourceMarkers: options.sourceMarkers,
      retryOptions: options.retryOptions ?? this.#options.retryOptions,
      cancelOnFailure: options.cancelOnFailure ?? this.#options.cancelOnFailure,
      customMerger: options.customMerger ?? this.#options.customMerger,
      outputMimeType: options.outputMimeType ?? this.#options.outputMimeType,
      postMergeValidator: options.postMergeValidator ?? this.#options.postMergeValidator,
      resumeValidation: options.resumeValidation ?? this.#options.resumeValidation,
    });
  }

  async synthesizeChunks(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options: SynthesizeChunksOptions = {},
  ): Promise<SsmlSynthesisResult> {
    const { region, subscriptionKey, outputFormat, signal, timeoutMs, timeouts } = this.#options;
    const endpoint = this.#options.endpoint?.trim() || ENDPOINT_TEMPLATE.replace("{region}", region);
    return synthesizeSsmlChunks(chunks, {
      endpoint,
      region,
      subscriptionKey,
      outputFormat: options.outputFormat ?? outputFormat,
      signal: options.signal ?? signal,
      timeoutMs: options.timeoutMs ?? timeoutMs,
      timeouts: options.timeouts ?? timeouts,
      sourceNodePath: options.sourceNodePath,
      onProgress: options.onProgress ?? this.#options.onProgress,
      concurrency: options.concurrency ?? this.#options.concurrency,
      retryOptions: options.retryOptions ?? this.#options.retryOptions,
      cancelOnFailure: options.cancelOnFailure ?? this.#options.cancelOnFailure,
      resumeChunks: options.resumeChunks,
      resumeChunkIndices: options.resumeChunkIndices,
      customMerger: options.customMerger ?? this.#options.customMerger,
      outputMimeType: options.outputMimeType ?? this.#options.outputMimeType,
      postMergeValidator: options.postMergeValidator ?? this.#options.postMergeValidator,
      resumeValidation: options.resumeValidation ?? this.#options.resumeValidation,
    });
  }

  async synthesizeSsmlSafe(ssml: string, options: SynthesizeSsmlSafeOptions = {}) {
    return synthesizeSsmlSafe(this, ssml, options);
  }

  async synthesizeChunksSafe(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options: SynthesizeSsmlChunksSafeOptions = {},
  ) {
    return synthesizeSsmlChunksSafe(this, chunks, {
      ...options,
      outputFormat: options.outputFormat ?? this.#options.outputFormat,
      signal: options.signal ?? this.#options.signal,
      timeoutMs: options.timeoutMs ?? this.#options.timeoutMs,
      timeouts: options.timeouts ?? this.#options.timeouts,
      onProgress: options.onProgress ?? this.#options.onProgress,
      concurrency: options.concurrency ?? this.#options.concurrency,
      retryOptions: options.retryOptions ?? this.#options.retryOptions,
    });
  }

  async synthesizeSsmlChunksSafe(
    chunks: readonly (SsmlSynthesisChunk | string)[],
    options: SynthesizeSsmlChunksSafeOptions = {},
  ) {
    return this.synthesizeChunksSafe(chunks, options);
  }
}
