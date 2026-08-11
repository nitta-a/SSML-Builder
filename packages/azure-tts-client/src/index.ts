/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

export type { AzureTtsClientOptions, TtsConfig } from "./types";
export { AzureTtsError, AzureTtsSdkError } from "./errors";
export { AzureTtsClient } from "./client";
export { synthesizeSpeech } from "./synthesis";
