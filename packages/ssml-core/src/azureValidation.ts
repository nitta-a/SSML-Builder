import { parseSsml } from "./parser.ts";

export type SsmlDiagnosticSeverity = "error" | "warning";

export interface SsmlDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: SsmlDiagnosticSeverity;
}

export interface AzureValidationOptions {
  allowedAudioOrigins?: readonly string[];
  allowExternalAudio?: boolean;
  allowHttpAudio?: boolean;
  customVoiceStyleMap?: Record<string, readonly string[]>;
  maxLength?: number;
  unknownVoicePolicy?: "error" | "warn" | "ignore";
  validateNestedVoices?: boolean;
}

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
): void {
  diagnostics.push({ ...location(source, offset), message, severity });
}

function attr(token: ElementToken, name: string): string | undefined {
  return token.attributes.get(name.toLowerCase());
}

function normalizeVoiceStyleMap(
  customVoiceStyleMap: Record<string, readonly string[]> | undefined,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>(
    Object.entries(EXPRESS_AS_STYLES).map(([voiceName, styles]) => [voiceName.toLowerCase(), styles]),
  );
  for (const [voiceName, styles] of Object.entries(customVoiceStyleMap ?? {})) {
    map.set(
      voiceName.toLowerCase(),
      styles.map((style) => style.toLowerCase()),
    );
  }
  return map;
}

function diagnosticSeverity(policy: AzureValidationOptions["unknownVoicePolicy"]): SsmlDiagnosticSeverity | undefined {
  if (policy === "ignore") return undefined;
  return policy === "error" ? "error" : "warning";
}

function validateElement(
  token: ElementToken,
  source: string,
  diagnostics: SsmlDiagnostic[],
  voiceName: string | undefined,
  options: AzureValidationOptions,
  voiceStyleMap: ReadonlyMap<string, readonly string[]>,
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
    if (rate && !/^(x-slow|slow|medium|fast|x-fast|[+-]?\d+(?:\.\d+)?%)$/.test(rate.trim()))
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
    const supportedStyles = voiceName ? voiceStyleMap.get(voiceName.toLowerCase()) : undefined;
    const severity = diagnosticSeverity(options.unknownVoicePolicy ?? "warn");
    if (style && supportedStyles && !supportedStyles.includes(style.toLowerCase()) && severity)
      addDiagnostic(
        diagnostics,
        source,
        token.start,
        `Unknown style "${style}" is not supported by voice "${voiceName}" according to the configured voice style map.`,
        severity,
      );
    if (style && voiceName && !supportedStyles && severity)
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
    return [{ line: 1, column: 1, message: "SSML input must be a string", severity: "error" }];
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
  const voiceStyleMap = normalizeVoiceStyleMap(options.customVoiceStyleMap);
  const policySeverity = diagnosticSeverity(options.unknownVoicePolicy ?? "warn");
  const voicesToValidate = options.validateNestedVoices === false ? voices.slice(0, 1) : voices;
  for (const token of voicesToValidate) {
    const name = attr(token, "name")?.trim();
    if (name && !voiceStyleMap.has(name.toLowerCase()) && policySeverity)
      addDiagnostic(
        diagnostics,
        ssml,
        token.start,
        `Unknown voice "${name}" is not registered in the voice style map.`,
        policySeverity,
      );
  }
  for (const token of tokens) {
    const tokenVoiceName = options.validateNestedVoices === false ? voiceName : token.parentVoiceName;
    validateElement(token, ssml, diagnostics, tokenVoiceName, options, voiceStyleMap);
  }
  return diagnostics;
}
