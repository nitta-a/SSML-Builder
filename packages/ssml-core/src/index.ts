/**
 * ssml-core: Core SSML building utilities.
 * Provides types and helpers for constructing SSML documents.
 */

export interface SsmlDocument {
  version: string;
  lang: string;
  content: string;
}

export function buildSsml(content: string, lang = "en-US"): SsmlDocument {
  return {
    version: "1.0",
    lang,
    content,
  };
}
