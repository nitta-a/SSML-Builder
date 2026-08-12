import { buildSsml } from "./builder.ts";
import {
  DEFAULT_SSML_LANGUAGE,
  DEFAULT_SSML_VERSION,
  SSML_ATTRS,
  SSML_TAGS,
  SYNTHESIS_NAMESPACE,
} from "./constants/ssml.ts";
import { parseSsml } from "./parser.ts";
import type { ProsodyElement, SsmlAttributes, SsmlDocument, SsmlNode, VoiceElement } from "./types.ts";

export type SsmlPartialVoice = Pick<VoiceElement, "name" | "effect" | "attributes">;

export type SsmlPartialProsody = Pick<ProsodyElement, "rate" | "pitch" | "volume" | "contour" | "range" | "attributes">;

export interface SsmlPartialContext {
  /** SSML version used for the generated document. */
  version?: string;
  /** BCP-47 language tag used for the generated document. */
  lang?: string;
  /** Preferred voice name; a voice object takes precedence, while this overrides a string `voice` shorthand. */
  voiceName?: string;
  /** Optional Azure voice effect used with `voiceName` or a string `voice` shorthand. */
  voiceEffect?: string;
  /** A voice name shorthand or a voice object whose attributes are preserved. */
  voice?: string | SsmlPartialVoice;
  /** Optional prosody values applied around the partial text. */
  prosody?: SsmlPartialProsody;
  /** Additional attributes added to the generated `speak` element. */
  attributes?: SsmlAttributes;
}

export interface BuildPartialSsmlOptions extends SsmlPartialContext {
  text: string;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function getPartialTextNodes(text: string, version: string, lang: string): SsmlNode[] {
  if (!text.includes("<")) {
    return [text];
  }

  try {
    const openingTag = `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${escapeAttribute(version)}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${escapeAttribute(lang)}">`;
    return parseSsml(`${openingTag}${text}</${SSML_TAGS.SPEAK}>`).children ?? [];
  } catch {
    return [{ type: "text", value: text }];
  }
}

function getVoiceContext(context: SsmlPartialContext): SsmlPartialVoice | undefined {
  const voice = context.voice;
  if (typeof voice === "object" && voice !== null) {
    return voice;
  }

  if (context.voiceName === undefined && context.voiceEffect === undefined && typeof voice !== "string") {
    return undefined;
  }

  return {
    name: context.voiceName ?? voice,
    effect: context.voiceEffect,
  };
}

function serializePartialSsml(text: string, context: SsmlPartialContext): string {
  const version = context.version ?? DEFAULT_SSML_VERSION;
  const lang = context.lang ?? DEFAULT_SSML_LANGUAGE;
  let children = getPartialTextNodes(text, version, lang);

  if (context.prosody) {
    children = [
      {
        type: SSML_TAGS.PROSODY,
        ...context.prosody,
        children,
      },
    ];
  }

  const voice = getVoiceContext(context);
  if (voice) {
    children = [
      {
        type: SSML_TAGS.VOICE,
        ...voice,
        children,
      },
    ];
  }

  const document: SsmlDocument = {
    type: SSML_TAGS.SPEAK,
    version,
    lang,
    attributes: context.attributes,
    children,
  };
  return buildSsml(document);
}

export function buildPartialSsml(text: string, context?: SsmlPartialContext): string;
export function buildPartialSsml(options: BuildPartialSsmlOptions): string;
export function buildPartialSsml(
  textOrOptions: string | BuildPartialSsmlOptions,
  context?: SsmlPartialContext,
): string {
  if (typeof textOrOptions === "string") {
    return serializePartialSsml(textOrOptions, context ?? {});
  }

  return serializePartialSsml(textOrOptions.text, textOrOptions);
}
