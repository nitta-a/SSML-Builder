/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export type { AzureTtsClientOptions, TtsConfig } from "./types.ts";
export { AzureTtsError, AzureTtsSdkError } from "./errors.ts";
export { AzureTtsClient } from "./client.ts";
export { synthesizeSpeech } from "./synthesis.ts";
