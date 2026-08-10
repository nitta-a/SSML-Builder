/**
 * ssml-core: Core SSML building utilities.
 * Provides types and helpers for constructing SSML documents.
 */

export * from "./types.ts";
export { buildSsml } from "./builder.ts";
export { parseSsml } from "./parser.ts";
export { validateSsml } from "./validation.ts";
export type { SsmlValidationError } from "./validation.ts";
