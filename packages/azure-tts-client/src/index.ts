/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export type {
  AzureTtsClientOptions,
  AzureTtsLogger,
  SsmlSynthesisBookmark,
  SsmlSynthesisBoundary,
  SsmlSynthesisResult,
  SsmlSynthesisViseme,
  SsmlSynthesisChunk,
  SynthesisProgressEvent,
  SynthesizeChunksOptions,
  TtsConfig,
} from "./types.ts";
export { AzureTtsError, AzureTtsSdkError } from "./errors.ts";
export { AzureTtsClient } from "./client.ts";
export { synthesizeSpeech } from "./synthesis.ts";
export { synthesizeSsml } from "./synthesis.ts";
export { mergeSynthesisResults, synthesizeSsmlChunks } from "./synthesis.ts";
export { synthesizeSsmlSafe } from "./safe.ts";
export type {
  AzureApiErrorResult,
  Result,
  SsmlSynthesisSafeResult,
  SsmlValidationError as AzureSsmlValidationError,
  Success,
  SynthesisResult,
  SynthesizeSsmlSafeOptions,
  ValidationErrorResult,
} from "./safe.ts";
export { fetchAzureVoiceCatalog } from "./voiceCatalog.ts";
export type {
  AzureVoiceCatalog,
  AzureVoiceCatalogVoice,
  FetchedAzureVoiceCatalogMetadata,
  FetchAzureVoiceCatalogOptions,
} from "./voiceCatalog.ts";
