import { buildSsml } from "./builder.ts";
import { parseSsml } from "./parser.ts";
import type { ProsodyElement, SsmlAttributes, SsmlDocument, SsmlNode, VoiceElement } from "./types.ts";

export type SsmlPartialVoice = Pick<VoiceElement, "name" | "effect" | "attributes">;

export type SsmlPartialProsody = Pick<ProsodyElement, "rate" | "pitch" | "volume" | "contour" | "range" | "attributes">;

export interface SsmlPartialContext {
  /** SSML version and language used for the generated document. */
  version?: string;
  lang?: string;
  /** Preferred voice name; a voice object takes precedence, while this overrides a string `voice` shorthand. */
  voiceName?: string;
  /** Optional Azure voice effect used with `voiceName` or a string `voice` shorthand. */
  voiceEffect?: string;
  /** A voice name shorthand or a voice object whose attributes are preserved. */
  voice?: string | SsmlPartialVoice;
  prosody?: SsmlPartialProsody;
  attributes?: SsmlAttributes;
}

export interface BuildPartialSsmlOptions extends SsmlPartialContext {
  text: string;
}

function getPartialTextNodes(text: string, version: string, lang: string): SsmlNode[] {
  if (!text.includes("<")) {
    return [text];
  }

  try {
    const wrapper = buildSsml({
      version,
      lang,
      children: [],
    });
    const openingTagStart = wrapper.indexOf("<speak");
    const openingTagEnd = openingTagStart < 0 ? -1 : wrapper.indexOf(">", openingTagStart);
    if (openingTagEnd < 0) {
      return [{ type: "text", value: text }];
    }

    return parseSsml(`${wrapper.slice(0, openingTagEnd + 1)}${text}</speak>`).children ?? [];
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
  const version = context.version ?? "1.0";
  const lang = context.lang ?? "en-US";
  let children = getPartialTextNodes(text, version, lang);

  if (context.prosody) {
    children = [
      {
        type: "prosody",
        ...context.prosody,
        children,
      },
    ];
  }

  const voice = getVoiceContext(context);
  if (voice) {
    children = [
      {
        type: "voice",
        ...voice,
        children,
      },
    ];
  }

  const document: SsmlDocument = {
    type: "speak",
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
