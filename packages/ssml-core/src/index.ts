/**
 * ssml-core: Core SSML building utilities.
 * Provides types and helpers for constructing SSML documents.
 */

export * from "./types.ts";
export { buildSsml } from "./builder.ts";
export { buildPartialSsml } from "./partial.ts";
export { splitSsmlDocument } from "./split.ts";
export type { SplitSsmlOptions, SsmlChunk, SsmlChunkContext, SsmlTextRange } from "./split.ts";
export type {
  BuildPartialSsmlOptions,
  SsmlPartialContext,
  SsmlPartialProsody,
  SsmlPartialVoice,
} from "./partial.ts";
export { parseSsml } from "./parser.ts";
export { validateSsml } from "./validation.ts";
export type { SsmlValidationError } from "./validation.ts";
export { extractSsmlText, mapSsmlTextNodes } from "./textNodes.ts";
export type {
  MapSsmlTextNodesOptions,
  SsmlSourceMap,
  SsmlSourceMarker,
  SsmlSourceTextSegment,
  SsmlTextNodeContext,
} from "./textNodes.ts";
export { getSsmlSourceMap } from "./textNodes.ts";
export {
  extractSsmlTranslatableText,
  fromPlainTextToSsml,
  validateSsmlStructureIntegrity,
} from "./migration.ts";
export type {
  ExtractSsmlTranslatableTextOptions,
  FromPlainTextToSsmlOptions,
  SsmlStructureIntegrityResult,
  SsmlStructureMismatch,
} from "./migration.ts";
export {
  areAzureLanguagesEquivalent,
  createAzureUrlValidatorRunner,
  isValidAzureAudioDuration,
  normalizeAzureLanguage,
  validateAzureSsml,
  validateAzureSsmlChunks,
} from "./azureValidation.ts";
export { getAzureVoiceCatalogMetadata, getBuiltInVoiceCatalogMetadata } from "./voiceCatalog.ts";
export type { AzureVoiceCatalogMetadata } from "./generated/azureVoiceCatalog.ts";
export type {
  AzureDiagnosticCode,
  AzureLanguageNormalizationOptions,
  AzureUrlValidationResult,
  AzureUrlValidationRunnerOptions,
  AzureUrlValidator,
  AzureValidationOptions,
  AzureSsmlValidationOptions,
  AzureVoiceDefinition,
  AzureVoiceMetadata,
  SsmlDiagnostic,
  Diagnostic,
  SsmlDiagnosticSource,
  SsmlDiagnosticSeverity,
} from "./azureValidation.ts";
