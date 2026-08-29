/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export type {
  AzureTtsClientOptions,
  AzureTtsLogger,
  MergedSynthesisResult,
  SsmlSynthesisBookmark,
  SsmlSynthesisBoundary,
  SsmlSynthesisResult,
  SsmlSynthesisViseme,
  SsmlSynthesisChunk,
  SynthesisProgressEvent,
  SynthesizeChunksOptions,
  SynthesisChunkStatus,
  TtsConfig,
} from "./types.ts";
export {
  AzureTtsError,
  AzureTtsSdkError,
  MergeError,
  SynthesisCancelledError,
  SynthesisTimeoutError,
  UnsupportedMergeFormatError,
} from "./errors.ts";
export type { AzureTtsSynthesisError, SynthesisErrorKind } from "./errors.ts";
export { AzureTtsClient } from "./client.ts";
export { synthesizeSpeech } from "./synthesis.ts";
export { synthesizeSsml } from "./synthesis.ts";
export {
  canMergeAudioFormat,
  mergeAudioBuffers,
  mergeSynthesisResults,
  resolveMergeAudioFormat,
  synthesizeSsmlChunks,
} from "./synthesis.ts";
export type { MergeAudioFormat, MergeAudioOptions, MergeSynthesisOptions } from "./synthesis.ts";
export { DEFAULT_OUTPUT_FORMAT, resolveMimeType } from "./outputFormats.ts";
export type { AzureTtsOutputFormat } from "./outputFormats.ts";
export { ChunkValidationError, synthesizeSsmlChunksSafe, synthesizeSsmlSafe } from "./safe.ts";
export type {
  AzureApiErrorResult,
  Result,
  SsmlSynthesisSafeResult,
  SsmlSynthesisError,
  SsmlValidationError as AzureSsmlValidationError,
  Success,
  SynthesisResult,
  SynthesizeSsmlSafeOptions,
  SsmlSynthesisChunksSafeResult,
  SynthesizeSsmlChunksSafeOptions,
  ValidationErrorResult,
} from "./safe.ts";
export { fetchAzureVoiceCatalog } from "./voiceCatalog.ts";
export type {
  AzureVoiceCatalog,
  AzureVoiceCatalogVoice,
  FetchedAzureVoiceCatalogMetadata,
  FetchAzureVoiceCatalogOptions,
} from "./voiceCatalog.ts";
