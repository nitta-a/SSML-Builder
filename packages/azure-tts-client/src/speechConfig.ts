import { SpeechConfig } from "microsoft-cognitiveservices-speech-sdk";
import { DEFAULT_OUTPUT_FORMAT, resolveOutputFormat } from "./outputFormats.ts";
import type { TtsConfig } from "./types.ts";

export function resolveEndpoint(config: TtsConfig): string {
  return config.endpoint.replace(/\{region\}/g, encodeURIComponent(config.region));
}

export function createSpeechConfig(config: TtsConfig): SpeechConfig {
  const { outputFormat = DEFAULT_OUTPUT_FORMAT, subscriptionKey } = config;

  const endpoint = new URL(resolveEndpoint(config));
  const speechConfig = SpeechConfig.fromEndpoint(endpoint, subscriptionKey);
  speechConfig.speechSynthesisOutputFormat = resolveOutputFormat(outputFormat);
  return speechConfig;
}
