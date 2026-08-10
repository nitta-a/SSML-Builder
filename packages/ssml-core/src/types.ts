export type SsmlAttributeValue = string | number;

export type SsmlAttributes = Record<string, SsmlAttributeValue>;

export interface SsmlText {
  type: "text";
  value: string;
}

export type SsmlNode = string | SsmlText | SsmlElement;

export interface SsmlElementBase {
  children?: SsmlNode[];
  attributes?: SsmlAttributes;
}

export interface VoiceElement extends SsmlElementBase {
  type: "voice";
  name?: string;
  effect?: string;
}

export interface ProsodyElement extends SsmlElementBase {
  type: "prosody";
  rate?: SsmlAttributeValue;
  pitch?: SsmlAttributeValue;
  volume?: SsmlAttributeValue;
  contour?: string;
  range?: SsmlAttributeValue;
}

export interface BreakElement extends SsmlElementBase {
  type: "break";
  time?: SsmlAttributeValue;
  strength?: string;
}

export interface ExpressAsElement extends SsmlElementBase {
  type: "express-as" | "expressAs" | "mstts:express-as";
  style?: string;
  styleDegree?: SsmlAttributeValue;
  styledegree?: SsmlAttributeValue;
  role?: string;
}

export interface SayAsElement extends SsmlElementBase {
  type: "say-as" | "sayAs";
  interpretAs?: string;
  "interpret-as"?: string;
  format?: string;
  detail?: string;
}

export interface PhonemeElement extends SsmlElementBase {
  type: "phoneme";
  alphabet?: string;
  ph?: string;
}

export interface EmphasisElement extends SsmlElementBase {
  type: "emphasis";
  level?: string;
}

export interface AudioElement extends SsmlElementBase {
  type: "audio";
  src?: string;
  desc?: string;
  clipBegin?: SsmlAttributeValue;
  clipEnd?: SsmlAttributeValue;
  speed?: SsmlAttributeValue;
  repeatCount?: SsmlAttributeValue;
  repeatDuration?: SsmlAttributeValue;
  soundLevel?: SsmlAttributeValue;
}

export interface SubElement extends SsmlElementBase {
  type: "sub";
  alias?: string;
}

export interface LangElement extends SsmlElementBase {
  type: "lang";
  lang?: string;
}

export interface MarkElement extends SsmlElementBase {
  type: "mark";
  name?: string;
}

export interface BookmarkElement extends SsmlElementBase {
  type: "bookmark";
  mark?: string;
}

export interface LexiconElement extends SsmlElementBase {
  type: "lexicon";
  uri?: string;
}

export interface ParagraphElement extends SsmlElementBase {
  type: "p";
}

export interface SentenceElement extends SsmlElementBase {
  type: "s";
}

export interface WordElement extends SsmlElementBase {
  type: "w";
}

export interface MsttsSilenceElement extends SsmlElementBase {
  type: "mstts:silence" | "silence";
  typeValue?: string;
  silenceType?: string;
  value?: SsmlAttributeValue;
}

export interface MsttsVisemeElement extends SsmlElementBase {
  type: "mstts:viseme" | "viseme";
  typeValue?: string;
  visemeType?: string;
}

export interface NamedElement extends SsmlElementBase {
  type: "element";
  name: string;
}

export interface CustomElement extends SsmlElementBase {
  type: "custom";
  name: string;
}

export type SsmlElement =
  | VoiceElement
  | ProsodyElement
  | BreakElement
  | ExpressAsElement
  | SayAsElement
  | PhonemeElement
  | EmphasisElement
  | AudioElement
  | SubElement
  | LangElement
  | MarkElement
  | BookmarkElement
  | LexiconElement
  | ParagraphElement
  | SentenceElement
  | WordElement
  | MsttsSilenceElement
  | MsttsVisemeElement
  | NamedElement
  | CustomElement;

export interface SsmlDocument {
  type?: "speak";
  version: string;
  lang: string;
  children?: SsmlNode[];
  /** @deprecated Use children to represent the document body. */
  content?: string;
  attributes?: SsmlAttributes;
}

export type SsmlVoiceElement = VoiceElement;
export type SsmlProsodyElement = ProsodyElement;
export type SsmlBreakElement = BreakElement;
export type SsmlExpressAsElement = ExpressAsElement;
export type SsmlSayAsElement = SayAsElement;
export type SsmlPhonemeElement = PhonemeElement;
