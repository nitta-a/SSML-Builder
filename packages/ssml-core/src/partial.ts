import { buildSsml } from "./builder.ts";
import { parseSsml } from "./parser.ts";
import type {
  ProsodyElement,
  SsmlAttributes,
  SsmlDocument,
  SsmlNode,
  VoiceElement,
} from "./types.ts";

export type SsmlPartialVoice = Pick<VoiceElement, "name" | "effect" | "attributes">;

export type SsmlPartialProsody = Pick<
  ProsodyElement,
  "rate" | "pitch" | "volume" | "contour" | "range" | "attributes"
>;

export interface SsmlPartialContext {
  version?: string;
  lang?: string;
  voiceName?: string;
  voiceEffect?: string;
  voice?: string | SsmlPartialVoice;
  prosody?: SsmlPartialProsody;
  attributes?: SsmlAttributes;
}

export interface BuildPartialSsmlOptions extends SsmlPartialContext {
  text: string;
  context?: SsmlPartialContext;
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
    const openingTagEnd = wrapper.indexOf(">") + 1;
    return parseSsml(`${wrapper.slice(0, openingTagEnd)}${text}</speak>`).children ?? [];
  } catch {
    return [text];
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

function normalizeContext(
  context: SsmlPartialContext | undefined,
  directOptions: SsmlPartialContext | undefined,
): SsmlPartialContext {
  return {
    ...(context ?? {}),
    ...(directOptions ?? {}),
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
export function buildPartialSsml(context: SsmlPartialContext, text: string): string;
export function buildPartialSsml(options: BuildPartialSsmlOptions): string;
export function buildPartialSsml(
  textOrOptionsOrContext: string | BuildPartialSsmlOptions | SsmlPartialContext,
  contextOrText?: SsmlPartialContext | string,
): string {
  if (typeof textOrOptionsOrContext === "string") {
    return serializePartialSsml(textOrOptionsOrContext, contextOrText as SsmlPartialContext | undefined);
  }

  if (typeof contextOrText === "string") {
    return serializePartialSsml(contextOrText, textOrOptionsOrContext);
  }

  const { text, context, ...directOptions } = textOrOptionsOrContext as BuildPartialSsmlOptions;
  return serializePartialSsml(text, normalizeContext(context, directOptions));
}
