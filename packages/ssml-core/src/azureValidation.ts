import { parseSsml } from "./parser.ts";

export type SsmlDiagnosticSeverity = "error" | "warning";
export type SsmlDiagnosticSource = "ssml-static-validator";

export type AzureDiagnosticCode = "azure-unknown-voice" | "azure-unsupported-style" | "azure-locale-mismatch";

export interface SsmlDiagnostic {
  code?: AzureDiagnosticCode;
  line: number;
  column: number;
  message: string;
  severity: SsmlDiagnosticSeverity;
  source: SsmlDiagnosticSource;
}

export interface AzureVoiceDefinition {
  name: string;
  locale: string;
  secondaryLocales?: readonly string[];
  styles?: readonly string[];
}

/** Alias retained for consumers that prefer the metadata terminology. */
export interface AzureVoiceMetadata extends AzureVoiceDefinition {}

export interface AzureValidationOptions {
  allowedAudioOrigins?: readonly string[];
  allowExternalAudio?: boolean;
  allowHttpAudio?: boolean;
  customVoiceStyleMap?: Record<string, readonly string[]>;
  customVoiceDefinitions?: readonly AzureVoiceDefinition[];
  languageAliases?: Record<string, string | readonly string[]>;
  maxLength?: number;
  normalizeLanguage?: (lang: string) => string;
  unknownVoicePolicy?: "error" | "warn" | "ignore";
  unsupportedStylePolicy?: "error" | "warn" | "ignore";
  validateNestedVoices?: boolean;
  voiceCatalog?: readonly AzureVoiceDefinition[];
  voiceDefinitions?: readonly AzureVoiceDefinition[];
}

export type AzureLanguageNormalizationOptions = Pick<AzureValidationOptions, "languageAliases" | "normalizeLanguage">;

/** @deprecated Use AzureValidationOptions instead. */
export type AzureSsmlValidationOptions = AzureValidationOptions;

interface ElementToken {
  attributes: Map<string, string>;
  end: number;
  name: string;
  parentVoiceName?: string;
  start: number;
  selfClosing: boolean;
}

const EXPRESS_AS_STYLES: Readonly<Record<string, readonly string[]>> = {
  "en-us-jennyneural": [
    "assistant",
    "chat",
    "customerservice",
    "newscast",
    "cheerful",
    "empathetic",
    "excited",
    "friendly",
    "hopeful",
    "sad",
    "shouting",
    "terrified",
    "unfriendly",
    "whispering",
  ],
  "en-us-guyneural": [
    "angry",
    "cheerful",
    "excited",
    "friendly",
    "hopeful",
    "newscast",
    "sad",
    "shouting",
    "terrified",
    "unfriendly",
    "whispering",
  ],
  "en-us-jennymultilingualneural": [
    "cheerful",
    "empathetic",
    "excited",
    "friendly",
    "hopeful",
    "sad",
    "shouting",
    "terrified",
    "unfriendly",
    "whispering",
  ],
  "en-us-andrewneural": ["empathetic", "relieved"],
  "ja-jp-mayuneural": ["calm", "cheerful", "sad"],
  "ja-jp-nanamineural": ["chat", "customerservice", "cheerful", "whispering", "sad"],
  "ja-jp-keitaneural": ["chat"],
  "ko-kr-sunhineural": ["cheerful", "sad"],
  "zh-cn-yunxineural": [
    "narration-relaxed",
    "embarrassed",
    "fearful",
    "sad",
    "disgruntled",
    "serious",
    "angry",
    "depressed",
    "chat",
    "cheerful",
    "assistant",
  ],
  "zh-cn-xiaoxiaoneural": [
    "assistant",
    "chat",
    "customerservice",
    "newscast",
    "cheerful",
    "empathetic",
    "excited",
    "friendly",
    "hopeful",
    "sad",
    "terrified",
    "whispering",
    "poetry-reading",
    "sports_commentary",
    "sports_commentary_excited",
    "story",
  ],
  "fr-fr-deniseneural": ["cheerful", "sad"],
  "fr-fr-henrineural": ["cheerful", "sad"],
  "pt-br-franciscaneural": ["calm"],
  "it-it-elsaneural": ["cheerful", "sad"],
  "de-de-katjaneural": ["cheerful", "sad"],
  "de-de-conradneural": ["cheerful", "sad"],
  "ru-ru-svetlananeural": ["cheerful", "sad", "angry", "disgruntled", "embarrassed", "fearful"],
};

const ALLOWED_BREAK_STRENGTHS = new Set(["none", "x-weak", "weak", "medium", "strong", "x-strong"]);
const ALLOWED_SAY_AS = new Set([
  "characters",
  "spell-out",
  "cardinal",
  "ordinal",
  "number",
  "date",
  "time",
  "telephone",
  "fraction",
  "address",
  "name",
  "currency",
  "number_digit",
]);
const ALLOWED_ROLES = new Set([
  "Girl",
  "Boy",
  "YoungAdultFemale",
  "YoungAdultMale",
  "OlderAdultFemale",
  "OlderAdultMale",
  "SeniorFemale",
  "SeniorMale",
]);
const ALLOWED_EMPHASIS_LEVELS = new Set(["strong", "moderate", "reduced", "none"]);
const ALLOWED_SILENCE_TYPES = new Set([
  "Leading",
  "Tailing",
  "Sentenceboundary",
  "Comma",
  "Semicolon",
  "Enumerationcomma",
]);
const ALLOWED_VISEME_TYPES = new Set(["redlips_front", "FacialExpression"]);

function decodeAttribute(value: string): string {
  return value.replace(
    /&(?:amp|apos|gt|lt|quot);/gi,
    (entity) =>
      ({ "&amp;": "&", "&apos;": "'", "&gt;": ">", "&lt;": "<", "&quot;": '"' })[entity.toLowerCase()] ?? entity,
  );
}

function findTagEnd(source: string, start: number): number {
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return source.length - 1;
}

function tokenizeElements(source: string): ElementToken[] {
  const tokens: ElementToken[] = [];
  const openElements: Array<{ name: string; voiceName?: string }> = [];
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf("<", index);
    if (start === -1) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", start)) {
      const end = source.indexOf("]]>", start + 9);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", start)) {
      const end = source.indexOf("?>", start + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    const end = findTagEnd(source, start + 1);
    const raw = source.slice(start, end + 1);
    if (raw.startsWith("</")) {
      openElements.pop();
      index = end + 1;
      continue;
    }
    const nameMatch = /^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(raw);
    if (!nameMatch?.[1]) {
      index = end + 1;
      continue;
    }
    const attributes = new Map<string, string>();
    const attributeSource = raw.slice(nameMatch[0].length, raw.length - 1).replace(/\/\s*$/, "");
    const attributePattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
    for (const match of attributeSource.matchAll(attributePattern)) {
      attributes.set(match[1].toLowerCase(), decodeAttribute(match[3]));
    }
    const selfClosing = /\/\s*>$/.test(raw);
    const parentVoiceName = [...openElements].reverse().find((element) => element.voiceName)?.voiceName;
    tokens.push({ attributes, end, name: nameMatch[1], parentVoiceName, selfClosing, start });
    if (!selfClosing) {
      openElements.push({
        name: nameMatch[1],
        voiceName: nameMatch[1].toLowerCase() === "voice" ? attributes.get("name") : parentVoiceName,
      });
    }
    index = end + 1;
  }
  return tokens;
}

function location(source: string, offset: number): { column: number; line: number } {
  const before = source.slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  return { line, column: before.length - (before.lastIndexOf("\n") + 1) + 1 };
}

function addDiagnostic(
  diagnostics: SsmlDiagnostic[],
  source: string,
  offset: number,
  message: string,
  severity: SsmlDiagnosticSeverity = "error",
  code?: AzureDiagnosticCode,
): void {
  diagnostics.push({
    ...location(source, offset),
    message,
    severity,
    source: "ssml-static-validator",
    ...(code ? { code } : {}),
  });
}

function isSupportedProsodyRate(value: string): boolean {
  const trimmed = value.trim();
  if (/^(x-slow|slow|medium|fast|x-fast|[+-]?\d+(?:\.\d+)?%)$/.test(trimmed)) return true;
  const multiplier = /^(\d+(?:\.\d+)?)(x)?$/i.exec(trimmed);
  if (!multiplier) return false;
  const numericValue = Number(multiplier[1]);
  return numericValue >= 0.5 && numericValue <= 2;
}

function attr(token: ElementToken, name: string): string | undefined {
  return token.attributes.get(name.toLowerCase());
}

const ADDITIONAL_VOICE_DEFINITIONS: readonly AzureVoiceDefinition[] = [
  { name: "zh-TW-HsiaoChenNeural", locale: "zh-TW" },
  { name: "es-ES-ElviraNeural", locale: "es-ES" },
  { name: "th-TH-PremwadeeNeural", locale: "th-TH" },
  { name: "fil-PH-AngeloNeural", locale: "fil-PH" },
  { name: "vi-VN-HoaiMyNeural", locale: "vi-VN" },
  { name: "id-ID-GadisNeural", locale: "id-ID" },
  { name: "ms-MY-YasminNeural", locale: "ms-MY" },
];

const DEFAULT_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "zh-CN": ["zh-Hans"],
  "zh-TW": ["zh-Hant"],
};

function canonicalLanguageTag(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) return "";
  try {
    return new Intl.Locale(trimmed).toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function createLanguageNormalizer(options: AzureValidationOptions): (language: string) => string {
  const aliases = new Map<string, string>();
  const addAliasGroup = (canonical: string, values: readonly string[]): void => {
    const normalizedCanonical = canonicalLanguageTag(canonical);
    if (!normalizedCanonical) return;
    aliases.set(normalizedCanonical, normalizedCanonical);
    for (const value of values) {
      const normalizedValue = canonicalLanguageTag(value);
      if (normalizedValue) aliases.set(normalizedValue, normalizedCanonical);
    }
  };
  for (const [canonical, values] of Object.entries(DEFAULT_LANGUAGE_ALIASES)) addAliasGroup(canonical, values);
  for (const [canonical, valueOrValues] of Object.entries(options.languageAliases ?? {}))
    addAliasGroup(canonical, typeof valueOrValues === "string" ? [valueOrValues] : valueOrValues);

  return (language: string): string => {
    const customValue = options.normalizeLanguage ? options.normalizeLanguage(language) : language;
    const normalized = canonicalLanguageTag(customValue);
    return aliases.get(normalized) ?? normalized;
  };
}

/** Normalizes an Azure language tag using BCP 47 and the configured aliases. */
export function normalizeAzureLanguage(language: string, options: AzureLanguageNormalizationOptions = {}): string {
  return createLanguageNormalizer(options)(language);
}

/** Compares two Azure language tags after BCP 47 and alias normalization. */
export function areAzureLanguagesEquivalent(
  first: string,
  second: string,
  options: AzureLanguageNormalizationOptions = {},
): boolean {
  const normalize = createLanguageNormalizer(options);
  const normalizedFirst = normalize(first);
  const normalizedSecond = normalize(second);
  if (normalizedFirst === normalizedSecond) return true;
  return (
    normalizedFirst === languagePart(normalizedFirst) &&
    languagePart(normalizedFirst) === languagePart(normalizedSecond)
  );
}

function voiceLocalePrefix(voiceName: string): { language: string; region: string; tag: string } | undefined {
  const match = /^(?<language>[A-Za-z]{2,3})-(?<region>[A-Za-z]{2}|\d{3})(?:-|$)/.exec(voiceName.trim());
  if (!match?.groups) return undefined;
  const tag = `${match.groups.language}-${match.groups.region}`;
  return {
    language: match.groups.language.toLowerCase(),
    region: match.groups.region.toLowerCase(),
    tag,
  };
}

function definitionFromStyleMap(voiceName: string, styles: readonly string[]): AzureVoiceDefinition {
  return {
    name: voiceName,
    locale: voiceLocalePrefix(voiceName)?.tag ?? "",
    styles,
  };
}

function normalizeVoiceCatalog(options: AzureValidationOptions): ReadonlyMap<string, AzureVoiceDefinition> {
  const definitions = new Map<string, AzureVoiceDefinition>();
  for (const [name, styles] of Object.entries(EXPRESS_AS_STYLES)) {
    definitions.set(name.toLowerCase(), definitionFromStyleMap(name, styles));
  }
  for (const definition of ADDITIONAL_VOICE_DEFINITIONS) definitions.set(definition.name.toLowerCase(), definition);
  for (const definition of options.voiceCatalog ?? []) definitions.set(definition.name.toLowerCase(), definition);
  for (const definition of options.voiceDefinitions ?? []) definitions.set(definition.name.toLowerCase(), definition);
  for (const definition of options.customVoiceDefinitions ?? [])
    definitions.set(definition.name.toLowerCase(), definition);
  for (const [voiceName, styles] of Object.entries(options.customVoiceStyleMap ?? {})) {
    const key = voiceName.toLowerCase();
    const current = definitions.get(key);
    definitions.set(key, {
      ...(current ?? definitionFromStyleMap(voiceName, styles)),
      name: current?.name ?? voiceName,
      styles: styles.map((style) => style.toLowerCase()),
    });
  }
  return definitions;
}

function diagnosticSeverity(policy: AzureValidationOptions["unknownVoicePolicy"]): SsmlDiagnosticSeverity | undefined {
  if (policy === "ignore") return undefined;
  return policy === "error" ? "error" : "warning";
}

function languagePart(language: string): string {
  try {
    return new Intl.Locale(language).language.toLowerCase();
  } catch {
    return language.split("-")[0]?.toLowerCase() ?? "";
  }
}

function definitionMatchesLanguage(
  definition: AzureVoiceDefinition | undefined,
  voiceName: string,
  language: string,
  normalizeLanguage: (language: string) => string,
): boolean | undefined {
  const candidateLanguages = definition
    ? [definition.locale, ...(definition.secondaryLocales ?? [])].filter(Boolean)
    : [voiceLocalePrefix(voiceName)?.tag ?? ""];
  if (candidateLanguages.length === 0 || !language.trim()) return undefined;
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedCandidates = candidateLanguages.map(normalizeLanguage);
  if (normalizedCandidates.includes(normalizedLanguage)) return true;
  if (!normalizedLanguage || !normalizedCandidates.some(Boolean)) return undefined;
  return normalizedLanguage === languagePart(normalizedLanguage)
    ? normalizedCandidates.some((candidate) => languagePart(candidate) === normalizedLanguage)
    : false;
}

function validateElement(
  token: ElementToken,
  source: string,
  diagnostics: SsmlDiagnostic[],
  voiceName: string | undefined,
  options: AzureValidationOptions,
  voiceCatalog: ReadonlyMap<string, AzureVoiceDefinition>,
): void {
  const name = token.name.toLowerCase();
  if (name === "voice" && !attr(token, "name")?.trim())
    addDiagnostic(diagnostics, source, token.start, '<voice> requires a non-empty "name" attribute.');
  if (name === "break") {
    const time = attr(token, "time");
    const strength = attr(token, "strength");
    if (!time && !strength)
      addDiagnostic(diagnostics, source, token.start, '<break> requires either "time" or "strength".');
    if (time && strength)
      addDiagnostic(diagnostics, source, token.start, '<break> must not specify both "time" and "strength".');
    if (time && !/^\d+(?:\.\d+)?(?:ms|s)$/.test(time.trim()))
      addDiagnostic(diagnostics, source, token.start, '<break time> must use a numeric value followed by "ms" or "s".');
    if (strength && !ALLOWED_BREAK_STRENGTHS.has(strength))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <break strength> value "${strength}".`);
  }
  if (name === "prosody") {
    const rate = attr(token, "rate");
    const pitch = attr(token, "pitch");
    const volume = attr(token, "volume");
    if (rate && !isSupportedProsodyRate(rate))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <prosody rate> value "${rate}".`);
    if (pitch && !/^(x-low|low|medium|high|x-high|[+-]?\d+(?:\.\d+)?(?:st|Hz|%)?)$/.test(pitch.trim()))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <prosody pitch> value "${pitch}".`);
    if (volume && !/^(silent|x-soft|soft|medium|loud|x-loud|[+-]?\d+(?:\.\d+)?(?:dB|%)?)$/.test(volume.trim()))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <prosody volume> value "${volume}".`);
  }
  if (name === "mstts:express-as" || name === "express-as" || name === "expressas") {
    const style = attr(token, "style");
    if (!style?.trim())
      addDiagnostic(diagnostics, source, token.start, '<mstts:express-as> requires a non-empty "style" attribute.');
    const degree = attr(token, "styledegree") ?? attr(token, "style-degree");
    if (degree && (!/^\d+(?:\.\d+)?$/.test(degree) || Number(degree) < 0.01 || Number(degree) > 2))
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        "<mstts:express-as styledegree> must be a number between 0.01 and 2.",
      );
    const role = attr(token, "role");
    if (role && !ALLOWED_ROLES.has(role))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <mstts:express-as role> value "${role}".`);
    const definition = voiceName ? voiceCatalog.get(voiceName.toLowerCase()) : undefined;
    const supportedStyles = definition?.styles;
    const severity = diagnosticSeverity(options.unsupportedStylePolicy ?? options.unknownVoicePolicy ?? "warn");
    if (
      style &&
      definition &&
      !supportedStyles?.some((candidate) => candidate.toLowerCase() === style.toLowerCase()) &&
      severity
    )
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        `Unknown style "${style}" is not supported by voice "${voiceName}" according to the configured voice style map.`,
        severity,
        "azure-unsupported-style",
      );
    if (style && voiceName && !definition && severity)
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        `Unknown style "${style}" cannot be verified because voice "${voiceName}" is not registered in the voice style map.`,
        severity,
      );
  }
  if (name === "say-as" || name === "sayas") {
    const interpretAs = attr(token, "interpret-as");
    if (!interpretAs || !ALLOWED_SAY_AS.has(interpretAs))
      addDiagnostic(diagnostics, source, token.start, `<say-as> requires a supported "interpret-as" value.`);
  }
  if (name === "phoneme" && (!attr(token, "alphabet") || !attr(token, "ph")))
    addDiagnostic(diagnostics, source, token.start, '<phoneme> requires both "alphabet" and "ph" attributes.');
  if (name === "emphasis" && attr(token, "level") && !ALLOWED_EMPHASIS_LEVELS.has(attr(token, "level") ?? ""))
    addDiagnostic(diagnostics, source, token.start, `Unsupported <emphasis level> value "${attr(token, "level")}".`);
  if (name === "sub" && !attr(token, "alias")?.trim())
    addDiagnostic(diagnostics, source, token.start, '<sub> requires a non-empty "alias" attribute.');
  if (name === "lang" && !attr(token, "xml:lang")?.trim() && !attr(token, "lang")?.trim())
    addDiagnostic(diagnostics, source, token.start, '<lang> requires an "xml:lang" attribute.');
  if (name === "mark" && !attr(token, "name")?.trim())
    addDiagnostic(diagnostics, source, token.start, '<mark> requires a non-empty "name" attribute.');
  if (name === "bookmark" && !attr(token, "mark")?.trim())
    addDiagnostic(diagnostics, source, token.start, '<bookmark> requires a non-empty "mark" attribute.');
  if (name === "lexicon") {
    const uri = attr(token, "uri");
    if (!uri) addDiagnostic(diagnostics, source, token.start, '<lexicon> requires a "uri" attribute.');
    else {
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== "https:")
          addDiagnostic(diagnostics, source, token.start, "<lexicon uri> must use HTTPS.");
      } catch {
        addDiagnostic(diagnostics, source, token.start, "<lexicon uri> must be an absolute HTTPS URL.");
      }
    }
  }
  if (name === "mstts:silence") {
    const type = attr(token, "type");
    const value = attr(token, "value");
    if (!type || !ALLOWED_SILENCE_TYPES.has(type))
      addDiagnostic(diagnostics, source, token.start, '<mstts:silence> requires a supported "type" attribute.');
    if (!value || !/^\d+(?:\.\d+)?(?:ms|s)$/.test(value.trim()))
      addDiagnostic(diagnostics, source, token.start, '<mstts:silence> requires a time-valued "value" attribute.');
  }
  if (name === "mstts:viseme") {
    const type = attr(token, "type");
    if (!type || !ALLOWED_VISEME_TYPES.has(type))
      addDiagnostic(diagnostics, source, token.start, '<mstts:viseme> requires a supported "type" attribute.');
  }
  if (name === "audio") {
    const src = attr(token, "src");
    if (!src) addDiagnostic(diagnostics, source, token.start, '<audio> requires a "src" attribute.');
    else {
      let parsed: URL;
      try {
        parsed = new URL(src);
      } catch {
        addDiagnostic(diagnostics, source, token.start, "<audio src> must be an absolute HTTP(S) URL.");
        return;
      }
      if (parsed.protocol !== "https:" && !(options.allowHttpAudio && parsed.protocol === "http:"))
        addDiagnostic(diagnostics, source, token.start, "<audio src> must use HTTPS.");
      if (options.allowedAudioOrigins && !options.allowedAudioOrigins.includes(parsed.origin))
        addDiagnostic(diagnostics, source, token.start, `<audio src> origin "${parsed.origin}" is not allowed.`);
      else if (!options.allowExternalAudio)
        addDiagnostic(
          diagnostics,
          source,
          token.start,
          `<audio src> external origin "${parsed.origin}" is blocked by default; set allowExternalAudio to true or provide allowedAudioOrigins.`,
          "error",
        );
    }
  }
}

export function validateAzureSsml(ssml: string, options: AzureValidationOptions = {}): SsmlDiagnostic[] {
  const diagnostics: SsmlDiagnostic[] = [];
  if (typeof ssml !== "string") {
    return [
      {
        line: 1,
        column: 1,
        message: "SSML input must be a string",
        severity: "error",
        source: "ssml-static-validator",
      },
    ];
  }
  const maxLength = options.maxLength ?? 10_000;
  if (ssml.length > maxLength)
    addDiagnostic(diagnostics, ssml, maxLength, `SSML exceeds the maximum length of ${maxLength} characters.`);
  try {
    parseSsml(ssml);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/ at position \d+$/, "") : String(error);
    const match = / at position (\d+)$/.exec(error instanceof Error ? error.message : "");
    addDiagnostic(diagnostics, ssml, match ? Number(match[1]) : 0, message);
    return diagnostics;
  }
  const tokens = tokenizeElements(ssml);
  const speak = tokens.find((token) => token.name.toLowerCase() === "speak");
  const voices = tokens.filter((token) => token.name.toLowerCase() === "voice");
  if (!speak || voices.length === 0)
    addDiagnostic(
      diagnostics,
      ssml,
      speak?.start ?? 0,
      "Azure SSML requires at least one <voice> element under <speak>.",
    );
  const voiceName = voices[0] ? attr(voices[0], "name") : undefined;
  const voiceCatalog = normalizeVoiceCatalog(options);
  const normalizeLanguage = createLanguageNormalizer(options);
  const policySeverity = diagnosticSeverity(options.unknownVoicePolicy ?? "warn");
  const voicesToValidate = options.validateNestedVoices === false ? voices.slice(0, 1) : voices;
  for (const token of voicesToValidate) {
    const name = attr(token, "name")?.trim();
    const language = attr(token, "xml:lang")?.trim() || (speak ? attr(speak, "xml:lang")?.trim() : undefined);
    const definition = name ? voiceCatalog.get(name.toLowerCase()) : undefined;
    if (name && !definition && policySeverity)
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Unknown voice "${name}" is not registered in the voice catalog.`,
        policySeverity,
        "azure-unknown-voice",
      );
    if (name && language && definitionMatchesLanguage(definition, name, language, normalizeLanguage) === false)
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Voice "${name}" does not match language "${language}"; the voice name prefix indicates a different language or region.`,
        "warning",
        "azure-locale-mismatch",
      );
  }
  for (const token of tokens) {
    const tokenVoiceName = options.validateNestedVoices === false ? voiceName : token.parentVoiceName;
    validateElement(token, ssml, diagnostics, tokenVoiceName, options, voiceCatalog);
  }
  return diagnostics;
}
