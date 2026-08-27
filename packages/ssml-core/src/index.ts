/**
 * ssml-core: Core SSML building utilities.
 * Provides types and helpers for constructing SSML documents.
 */

export * from "./types.ts";
export { buildSsml } from "./builder.ts";
export { buildPartialSsml } from "./partial.ts";
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
export type { MapSsmlTextNodesOptions, SsmlTextNodeContext } from "./textNodes.ts";
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
  isValidAzureAudioDuration,
  normalizeAzureLanguage,
  validateAzureSsml,
} from "./azureValidation.ts";
export { getAzureVoiceCatalogMetadata, getBuiltInVoiceCatalogMetadata } from "./voiceCatalog.ts";
export type { AzureVoiceCatalogMetadata } from "./generated/azureVoiceCatalog.ts";
export type {
  AzureDiagnosticCode,
  AzureLanguageNormalizationOptions,
  AzureValidationOptions,
  AzureSsmlValidationOptions,
  AzureVoiceDefinition,
  AzureVoiceMetadata,
  SsmlDiagnostic,
  SsmlDiagnosticSource,
  SsmlDiagnosticSeverity,
} from "./azureValidation.ts";
