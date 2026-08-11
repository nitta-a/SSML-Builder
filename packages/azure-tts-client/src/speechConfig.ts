import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { DEFAULT_OUTPUT_FORMAT, resolveOutputFormat } from "./outputFormats.ts";
import type { TtsConfig } from "./types.ts";

export function resolveEndpoint(config: TtsConfig): string {
  return config.endpoint.replace(
    /\{region\}/g,
    encodeURIComponent(config.region),
  );
}

export function createSpeechConfig(config: TtsConfig): SpeechSDK.SpeechConfig {
  const speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(
    new URL(resolveEndpoint(config)),
    config.subscriptionKey,
  );
  speechConfig.speechSynthesisOutputFormat = resolveOutputFormat(
    config.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
  );
  return speechConfig;
}
