import { parseSsml } from "./parser.ts";
import { AZURE_VOICE_DEFINITIONS } from "./generated/azureVoiceDefinitions.ts";

export type SsmlDiagnosticSeverity = "error" | "warning" | "info";
export type SsmlDiagnosticSource = "ssml-static-validator";

export type AzureDiagnosticCode =
  | "azure-unknown-voice"
  | "azure-unsupported-style"
  | "azure-locale-mismatch"
  | "azure-unsupported-tag-for-voice"
  | "azure-unsupported-model-for-voice"
  | "azure-preview-voice"
  | "azure-deprecated-voice"
  | "azure-preview-tag"
  | "azure-deprecated-tag";

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
  supportedTags?: readonly string[];
  unsupportedTags?: readonly string[];
  models?: readonly string[];
  regions?: readonly string[];
  status?: "ga" | "preview" | "deprecated";
}

/** Alias retained for consumers that prefer the metadata terminology. */
export interface AzureVoiceMetadata extends AzureVoiceDefinition {}

export interface AzureValidationOptions {
  allowedAudioOrigins?: readonly string[];
  allowExternalAudio?: boolean;
  allowHttpAudio?: boolean;
  customVoiceStyleMap?: Record<string, readonly string[]>;
  customVoiceDefinitions?: readonly AzureVoiceDefinition[];
  /** Host-side validation hook for URL-bearing SSML attributes. */
  urlValidator?: AzureUrlValidator;
  /** Source path associated with a chunk being validated. */
  sourceNodePath?: readonly string[];
  /** Alias for urlValidator retained for applications that use the longer name. */
  customUrlValidator?: AzureUrlValidator;
  /** Controls deduplication, caching, cancellation, and concurrency for URL checks. */
  urlValidation?: AzureUrlValidationRunnerOptions;
  /** Flat aliases retained for callers that prefer not to nest URL runner options. */
  urlValidatorConcurrency?: number;
  urlValidatorTimeoutMs?: number;
  urlValidatorSignal?: AbortSignal;
  urlValidatorCache?: Map<string, AzureUrlValidationResult>;
  languageAliases?: Record<string, string | readonly string[]>;
  maxLength?: number;
  /** Maximum XML element nesting depth, counting `<speak>` as depth 1. */
  maxXmlDepth?: number;
  /** Optional model identifier used to validate a voice's model compatibility. */
  model?: string;
  normalizeLanguage?: (lang: string) => string;
  /** Overrides the built-in preview tag list for this validation run. */
  previewTags?: readonly string[];
  /** Adds tags that should be reported as deprecated for this validation run. */
  deprecatedTags?: readonly string[];
  /** Explicit tag lifecycle metadata. This takes precedence over previewTags/deprecatedTags. */
  tagStatuses?: Readonly<Record<string, "ga" | "preview" | "deprecated">>;
  unknownVoicePolicy?: "error" | "warn" | "ignore";
  unsupportedStylePolicy?: "error" | "warn" | "ignore";
  validateNestedVoices?: boolean;
  voiceCatalog?: readonly AzureVoiceDefinition[];
  voiceDefinitions?: readonly AzureVoiceDefinition[];
}

export type AzureUrlValidationResult = boolean | { valid: boolean; reason?: string };
export type AzureUrlValidator = (
  url: string,
  context: { tag: string; attribute: string; sourceNodePath?: readonly string[] },
  signal: AbortSignal,
) => AzureUrlValidationResult | Promise<AzureUrlValidationResult>;

export interface AzureUrlValidationRunnerOptions {
  concurrency?: number;
  cache?: Map<string, AzureUrlValidationResult>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Wraps a URL validator with URL deduplication, bounded concurrency, caching, and cancellation. */
export function createAzureUrlValidatorRunner(
  validator: AzureUrlValidator,
  options: AzureUrlValidationRunnerOptions = {},
): AzureUrlValidator {
  if (typeof validator !== "function") throw new TypeError("A URL validator function is required.");
  const concurrency =
    options.concurrency === undefined
      ? Infinity
      : Number.isFinite(options.concurrency)
        ? Math.max(1, Math.floor(options.concurrency))
        : Infinity;
  const cache = options.cache ?? new Map<string, AzureUrlValidationResult>();
  const inFlight = new Map<string, Promise<AzureUrlValidationResult>>();
  const waiters: Array<() => void> = [];
  let active = 0;

  const configuredSignal = options.signal ?? new AbortController().signal;
  const acquire = async (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) throw new Error("URL validation was aborted.");
    if (active < concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let waiter: () => void;
      const abortHandler = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        signal.removeEventListener("abort", abortHandler);
        reject(new Error("URL validation was aborted."));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      waiter = () => {
        signal.removeEventListener("abort", abortHandler);
        resolve();
      };
      waiters.push(waiter);
    });
    active += 1;
  };
  const release = (): void => {
    active -= 1;
    waiters.shift()?.();
  };
  const check = async (
    url: string,
    context: { tag: string; attribute: string; sourceNodePath?: readonly string[] },
    signal = configuredSignal,
  ): Promise<AzureUrlValidationResult> => {
    if (signal.aborted) throw new Error("URL validation was aborted.");
    const key = `${context.tag}:${context.attribute}:${url}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = (async () => {
      await acquire(signal);
      try {
        if (signal.aborted) throw new Error("URL validation was aborted.");
        const validation = Promise.resolve(validator(url, context, signal));
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abortHandler: (() => void) | undefined;
        const cancellation = new Promise<AzureUrlValidationResult>((_resolve, reject) => {
          abortHandler = () => reject(new Error("URL validation was aborted."));
          signal.addEventListener("abort", abortHandler, { once: true });
          if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
            timer = setTimeout(
              () => reject(new Error(`URL validation timed out after ${options.timeoutMs} ms.`)),
              options.timeoutMs,
            );
          }
        });
        try {
          const result = await (timer || abortHandler ? Promise.race([validation, cancellation]) : validation);
          cache.set(key, result);
          return result;
        } finally {
          if (timer) clearTimeout(timer);
          if (abortHandler) signal.removeEventListener("abort", abortHandler);
        }
      } finally {
        release();
      }
    })();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  };
  return (url, context, signal) => check(url, context, signal ?? configuredSignal);
}

export type AzureLanguageNormalizationOptions = Pick<AzureValidationOptions, "languageAliases" | "normalizeLanguage">;

/** @deprecated Use AzureValidationOptions instead. */
export type AzureSsmlValidationOptions = AzureValidationOptions;

interface ElementToken {
  attributes: Map<string, string>;
  childElementIndex?: number;
  end: number;
  depth: number;
  parentName?: string;
  name: string;
  parentVoiceName?: string;
  start: number;
  selfClosing: boolean;
}

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
const DEFAULT_PREVIEW_TAGS = new Set(["mstts:voiceconversion"]);

function featureStatusForTag(
  name: string,
  options: AzureValidationOptions,
): "ga" | "preview" | "deprecated" | undefined {
  const tagName = canonicalTagName(name);
  const configured = Object.entries(options.tagStatuses ?? {}).find(
    ([candidate]) => canonicalTagName(candidate) === tagName,
  )?.[1];
  if (configured) return configured;
  if ((options.previewTags ?? [...DEFAULT_PREVIEW_TAGS]).some((candidate) => canonicalTagName(candidate) === tagName))
    return "preview";
  if ((options.deprecatedTags ?? []).some((candidate) => canonicalTagName(candidate) === tagName)) return "deprecated";
  return undefined;
}

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
  const openElements: Array<{ childElementCount: number; name: string; voiceName?: string }> = [];
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
    const parent = openElements[openElements.length - 1];
    const childElementIndex = parent?.childElementCount;
    if (parent) parent.childElementCount += 1;
    const parentVoiceName = [...openElements].reverse().find((element) => element.voiceName)?.voiceName;
    const tokenName = nameMatch[1];
    const tokenVoiceName =
      tokenName.toLowerCase() === "voice"
        ? attributes.get("name")
        : tokenName.toLowerCase() === "mstts:turn"
          ? (attributes.get("voice") ?? parentVoiceName)
          : parentVoiceName;
    tokens.push({
      attributes,
      childElementIndex,
      end,
      depth: openElements.length + 1,
      name: tokenName,
      parentName: parent?.name,
      parentVoiceName,
      selfClosing,
      start,
    });
    if (!selfClosing) {
      openElements.push({
        childElementCount: 0,
        name: tokenName,
        voiceName: tokenVoiceName,
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

/** Returns whether a value is a positive Azure SSML audio duration. */
export function isValidAzureAudioDuration(value: string): boolean {
  const trimmed = value.trim();
  const numeric = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(trimmed);
  if (numeric) return Number(numeric[1]) > 0;

  const clock = /^(\d{2,}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!clock) return false;
  return Number(clock[1]) > 0 || Number(clock[2]) > 0 || Number(clock[3]) > 0 || Number(clock[4] ?? 0) > 0;
}

function isValidAzureBackgroundAudioDuration(value: string): boolean {
  const match = /^(\d+)$/.exec(value.trim());
  if (!match) return false;
  const milliseconds = Number(match[1]);
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 10_000;
}

function attr(token: ElementToken, name: string): string | undefined {
  return token.attributes.get(name.toLowerCase());
}

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
  for (const definition of AZURE_VOICE_DEFINITIONS) definitions.set(definition.name.toLowerCase(), definition);
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

function canonicalTagName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized === "express-as" || normalized === "expressas") return "mstts:express-as";
  if (normalized === "sayas") return "say-as";
  return normalized;
}

function validateVoiceFeatureMatrix(
  token: ElementToken,
  source: string,
  diagnostics: SsmlDiagnostic[],
  voiceName: string | undefined,
  definition: AzureVoiceDefinition | undefined,
): void {
  if (!voiceName || !definition || token.name.toLowerCase() === "voice" || token.name.toLowerCase() === "mstts:turn")
    return;

  const tagName = canonicalTagName(token.name);
  const unsupportedTags = new Set((definition.unsupportedTags ?? []).map(canonicalTagName));
  const supportedTags = definition.supportedTags?.map(canonicalTagName);
  if (unsupportedTags.has(tagName) || (supportedTags !== undefined && !supportedTags.includes(tagName))) {
    addDiagnostic(
      diagnostics,
      source,
      token.start,
      `Tag <${token.name}> is not supported by voice "${voiceName}" according to the configured feature matrix.`,
      "error",
      "azure-unsupported-tag-for-voice",
    );
  }
}

function validateAudioSource(
  token: ElementToken,
  source: string,
  diagnostics: SsmlDiagnostic[],
  options: AzureValidationOptions,
  elementName: "audio" | "mstts:backgroundaudio",
): void {
  const src = attr(token, "src");
  if (!src) {
    addDiagnostic(diagnostics, source, token.start, `<${elementName}> requires a "src" attribute.`);
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    addDiagnostic(diagnostics, source, token.start, `<${elementName} src> must be an absolute HTTP(S) URL.`);
    return;
  }
  if (parsed.username || parsed.password)
    addDiagnostic(diagnostics, source, token.start, `<${elementName} src> must not contain URL credentials.`);
  if (parsed.protocol !== "https:" && !(options.allowHttpAudio && parsed.protocol === "http:"))
    addDiagnostic(diagnostics, source, token.start, `<${elementName} src> must use HTTPS.`);
  const isAllowedOrigin =
    options.allowedAudioOrigins?.some((allowedOrigin) => {
      try {
        const configured = new URL(allowedOrigin);
        if (
          (configured.protocol !== "https:" && configured.protocol !== "http:") ||
          configured.username ||
          configured.password ||
          configured.pathname !== "/" ||
          configured.search ||
          configured.hash
        )
          return false;
        return configured.origin === parsed.origin;
      } catch {
        return false;
      }
    }) ?? false;
  if (options.allowedAudioOrigins && !isAllowedOrigin)
    addDiagnostic(diagnostics, source, token.start, `<${elementName} src> origin "${parsed.origin}" is not allowed.`);
  else if (!isAllowedOrigin && !options.allowExternalAudio)
    addDiagnostic(
      diagnostics,
      source,
      token.start,
      `<${elementName} src> external origin "${parsed.origin}" is blocked by default; set allowExternalAudio to true or provide allowedAudioOrigins.`,
    );
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
  const tagStatus = featureStatusForTag(token.name, options);
  if (tagStatus === "preview")
    addDiagnostic(
      diagnostics,
      source,
      token.start,
      `<${token.name}> is an Azure Speech preview feature and may change or require preview access.`,
      "warning",
      "azure-preview-tag",
    );
  if (tagStatus === "deprecated")
    addDiagnostic(
      diagnostics,
      source,
      token.start,
      `<${token.name}> is deprecated by Azure Speech; migrate to a supported alternative.`,
      "info",
      "azure-deprecated-tag",
    );
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
  if (name === "mstts:audioduration") {
    const value = attr(token, "value");
    if (!value || !isValidAzureAudioDuration(value))
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        '<mstts:audioduration> requires a positive duration such as "10s", "5000ms", or "00:00:10".',
      );
    if (!token.selfClosing)
      addDiagnostic(diagnostics, source, token.start, "<mstts:audioduration> must be self-closing.");
  }
  if (name === "mstts:viseme") {
    const type = attr(token, "type");
    if (!type || !ALLOWED_VISEME_TYPES.has(type))
      addDiagnostic(diagnostics, source, token.start, '<mstts:viseme> requires a supported "type" attribute.');
  }
  if (name === "audio") {
    validateAudioSource(token, source, diagnostics, options, "audio");
  }
  if (name === "mstts:turn") {
    if (!attr(token, "voice")?.trim() && !attr(token, "speaker")?.trim())
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        '<mstts:turn> requires a non-empty "voice" or "speaker" attribute.',
      );
    if (token.parentName?.toLowerCase() !== "mstts:dialog")
      addDiagnostic(diagnostics, source, token.start, "<mstts:turn> is only allowed directly inside <mstts:dialog>.");
  }
  if (name === "mstts:backgroundaudio") {
    validateAudioSource(token, source, diagnostics, options, "mstts:backgroundaudio");
    const volume = attr(token, "volume");
    if (volume !== undefined && (!/^\d+(?:\.\d+)?$/.test(volume.trim()) || Number(volume) > 100))
      addDiagnostic(diagnostics, source, token.start, `Unsupported <mstts:backgroundaudio volume> value "${volume}".`);
    for (const [attribute, value] of [
      ["fadein", attr(token, "fadein")],
      ["fadeout", attr(token, "fadeout")],
    ] as const) {
      if (value !== undefined && !isValidAzureBackgroundAudioDuration(value))
        addDiagnostic(
          diagnostics,
          source,
          token.start,
          `<mstts:backgroundaudio ${attribute}> must be between 0 and 10000 milliseconds, for example "500ms" or "10s".`,
        );
    }
    if (token.parentName?.toLowerCase() !== "speak" || token.childElementIndex !== 0)
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        "<mstts:backgroundaudio> must be the first element directly under <speak>.",
      );
    if (!token.selfClosing)
      addDiagnostic(diagnostics, source, token.start, "<mstts:backgroundaudio> must be self-closing.");
  }
}

function validateAzureSsmlStatic(ssml: string, options: AzureValidationOptions = {}): SsmlDiagnostic[] {
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
  if (options.maxXmlDepth !== undefined && (!Number.isInteger(options.maxXmlDepth) || options.maxXmlDepth <= 0)) {
    addDiagnostic(diagnostics, ssml, 0, "maxXmlDepth must be a positive integer.");
  }
  try {
    parseSsml(ssml);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/ at position \d+$/, "") : String(error);
    const match = / at position (\d+)$/.exec(error instanceof Error ? error.message : "");
    addDiagnostic(diagnostics, ssml, match ? Number(match[1]) : 0, message);
    return diagnostics;
  }
  const tokens = tokenizeElements(ssml);
  if (options.maxXmlDepth !== undefined) {
    for (const token of tokens) {
      if (token.depth > options.maxXmlDepth) {
        addDiagnostic(
          diagnostics,
          ssml,
          token.start,
          `XML nesting depth ${token.depth} exceeds the configured maximum of ${options.maxXmlDepth}.`,
        );
      }
    }
  }
  const speak = tokens.find((token) => token.name.toLowerCase() === "speak");
  const voices = tokens.filter((token) => token.name.toLowerCase() === "voice");
  const backgroundAudioTokens = tokens.filter((token) => token.name.toLowerCase() === "mstts:backgroundaudio");
  for (const [index, token] of backgroundAudioTokens.entries()) {
    if (index > 0)
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        "An SSML document can contain at most one <mstts:backgroundaudio> element.",
      );
  }
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
    if (name && definition?.status === "preview")
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Voice "${name}" is an Azure Speech preview voice and may change or require preview access.`,
        "warning",
        "azure-preview-voice",
      );
    if (name && definition?.status === "deprecated")
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Voice "${name}" is deprecated by Azure Speech; migrate to a supported voice.`,
        "info",
        "azure-deprecated-voice",
      );
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
    const tokenName = token.name.toLowerCase();
    const tokenVoiceName =
      tokenName === "voice"
        ? attr(token, "name")?.trim()
        : tokenName === "mstts:turn"
          ? attr(token, "voice")?.trim() || token.parentVoiceName
          : options.validateNestedVoices === false
            ? voiceName
            : token.parentVoiceName;
    validateElement(token, ssml, diagnostics, tokenVoiceName, options, voiceCatalog);
    const definition = tokenVoiceName ? voiceCatalog.get(tokenVoiceName.toLowerCase()) : undefined;
    validateVoiceFeatureMatrix(token, ssml, diagnostics, tokenVoiceName, definition);
    if (
      tokenName === "voice" &&
      options.model &&
      definition?.models &&
      !definition.models.some((model) => model.toLowerCase() === options.model?.toLowerCase())
    ) {
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Voice "${tokenVoiceName}" does not support model "${options.model}" according to the configured feature matrix.`,
        "error",
        "azure-unsupported-model-for-voice",
      );
    }
  }
  return diagnostics;
}

function urlAttributes(token: ElementToken): Array<{ attribute: string; value: string }> {
  const tag = canonicalTagName(token.name);
  const attributes =
    tag === "audio" || tag === "mstts:backgroundaudio"
      ? ["src"]
      : tag === "lexicon"
        ? ["uri"]
        : tag === "mstts:voiceconversion"
          ? ["url"]
          : [];
  return attributes.flatMap((attribute) => {
    const value = attr(token, attribute);
    return value === undefined ? [] : [{ attribute, value }];
  });
}

/**
 * Validates Azure SSML synchronously unless a URL validator is supplied. URL
 * validation is asynchronous-capable so hosts can perform DNS/private-network checks.
 */
export function validateAzureSsml(
  ssml: string,
  options?: Omit<AzureValidationOptions, "urlValidator" | "customUrlValidator">,
): SsmlDiagnostic[];
export function validateAzureSsml(
  ssml: string,
  options: AzureValidationOptions & { urlValidator?: AzureUrlValidator; customUrlValidator?: AzureUrlValidator },
): SsmlDiagnostic[] | Promise<SsmlDiagnostic[]>;
export function validateAzureSsml(
  ssml: string,
  options: AzureValidationOptions = {},
): SsmlDiagnostic[] | Promise<SsmlDiagnostic[]> {
  const diagnostics = validateAzureSsmlStatic(ssml, options);
  const validator = options.urlValidator ?? options.customUrlValidator;
  if (!validator || typeof ssml !== "string") return diagnostics;
  const runnerOptions = options.urlValidation ?? {};
  const boundedValidator = createAzureUrlValidatorRunner(validator, {
    ...runnerOptions,
    ...(options.urlValidatorConcurrency !== undefined ? { concurrency: options.urlValidatorConcurrency } : {}),
    ...(options.urlValidatorTimeoutMs !== undefined ? { timeoutMs: options.urlValidatorTimeoutMs } : {}),
    ...(options.urlValidatorSignal ? { signal: options.urlValidatorSignal } : {}),
    ...(options.urlValidatorCache ? { cache: options.urlValidatorCache } : {}),
  });
  const validationSignal = options.urlValidatorSignal ?? options.urlValidation?.signal ?? new AbortController().signal;

  let tokens: ElementToken[];
  try {
    tokens = tokenizeElements(ssml);
  } catch {
    return diagnostics;
  }
  const checks = tokens.flatMap((token) =>
    urlAttributes(token).map(async ({ attribute, value }) => {
      try {
        const result = await boundedValidator(
          value,
          { tag: token.name, attribute, ...(options.sourceNodePath ? { sourceNodePath: options.sourceNodePath } : {}) },
          validationSignal,
        );
        const valid = typeof result === "boolean" ? result : result.valid;
        if (!valid) {
          const reason = typeof result === "boolean" ? undefined : result.reason;
          addDiagnostic(
            diagnostics,
            ssml,
            token.start,
            `<${token.name} ${attribute}> was rejected by the custom URL validator${reason ? `: ${reason}` : "."}`,
          );
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addDiagnostic(
          diagnostics,
          ssml,
          token.start,
          `<${token.name} ${attribute}> could not be validated by the custom URL validator: ${reason}`,
        );
      }
    }),
  );
  return Promise.all(checks).then(() => diagnostics);
}
