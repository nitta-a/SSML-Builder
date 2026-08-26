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
export { validateAzureSsml } from "./azureValidation.ts";
export type {
  AzureValidationOptions,
  AzureSsmlValidationOptions,
  SsmlDiagnostic,
  SsmlDiagnosticSeverity,
} from "./azureValidation.ts";
