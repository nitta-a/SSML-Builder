type SsmlPresetDescription = Readonly<Record<"ja" | "en", string>>;

export interface SsmlPreset {
  id: string;
  label: string;
  ssml: string;
  description?: string;
}

export const SSML_PRESETS: readonly SsmlPreset[] = [
  {
    id: "basic",
    label: "Basic speech",
    ssml: '<speak version="1.0" xml:lang="en-US">Hello, world!</speak>',
    description: "A minimal SSML document.",
  },
  {
    id: "voice",
    label: "Voice selection",
    ssml: '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello, world!</voice></speak>',
    description: "Speaks text with a selected voice.",
  },
  {
    id: "prosody",
    label: "Prosody",
    ssml: '<speak version="1.0" xml:lang="en-US"><prosody rate="fast" pitch="+2st">Hello, world!</prosody></speak>',
    description: "Adjusts the speech rate and pitch.",
  },
] as const;

export const MACRO_PRESETS = {
  announcementStrong: '<prosody rate="+5%" volume="loud"><emphasis level="strong">${text}</emphasis></prosody>',
  slowPolite: '<prosody rate="-15%" pitch="-5%">${text}</prosody>',
  fastCheerful: '<prosody rate="+20%" pitch="+5%">${text}</prosody>',
  questioningHighPitch: '<prosody pitch="+15%">${text}</prosody>',
  pauseSpeak: '<break time="500ms" />${text}',
} as const;

export type MacroPresetKey = keyof typeof MACRO_PRESETS;

export const BREAK_TIME_PRESETS = ["500ms", "1s", "2s", "3s"] as const;
export const BREAK_STRENGTH_PRESETS = ["none", "x-weak", "weak", "medium", "strong", "x-strong"] as const;

export const PROSODY_RATE_PRESETS = ["x-slow", "slow", "medium", "fast", "x-fast"] as const;
export const PROSODY_RATE_VALUES = [...PROSODY_RATE_PRESETS, "percentage"] as const;
export const PROSODY_PITCH_PRESETS = ["+2st", "-2st", "0st", "+4st", "-4st", "+8st", "-8st", "+12st", "-12st"] as const;
export const PROSODY_VOLUME_PRESETS = ["silent", "x-soft", "soft", "medium", "loud", "x-loud"] as const;

export const EXPRESS_AS_STYLE_PRESETS = [
  "cheerful",
  "friendly",
  "calm",
  "sad",
  "angry",
  "excited",
  "serious",
  "assistant",
  "chat",
  "customerservice",
  "hopeful",
  "newscast",
  "shouting",
  "terrified",
  "unfriendly",
  "whispering",
  "empathetic",
  "relieved",
  "fearful",
  "depressed",
  "disgruntled",
  "embarrassed",
  "narration-relaxed",
  "poetry-reading",
  "sports_commentary",
  "sports_commentary_excited",
  "story",
] as const;
export type ExpressAsStyle = (typeof EXPRESS_AS_STYLE_PRESETS)[number];

export const EXPRESS_AS_STYLE_CATEGORIES = {
  emotions: [
    "cheerful",
    "sad",
    "angry",
    "calm",
    "fearful",
    "depressed",
    "disgruntled",
    "embarrassed",
    "empathetic",
    "envious",
    "excited",
    "friendly",
    "gentle",
    "hopeful",
    "relieved",
    "serious",
    "shouting",
    "terrified",
    "unfriendly",
    "whispering",
  ],
  scenarios: ["chat", "customerservice", "assistant", "livecommercial", "poetry-reading", "story"],
  media: [
    "newscast",
    "newscast-casual",
    "newscast-formal",
    "narration-professional",
    "narration-relaxed",
    "documentary-narration",
    "advertisement_upbeat",
    "sports_commentary",
    "sports_commentary_excited",
  ],
} as const;

export type ExpressAsStyleCategory = keyof typeof EXPRESS_AS_STYLE_CATEGORIES | "other";

export function getExpressAsStyleCategory(style: string): ExpressAsStyleCategory {
  for (const [category, styles] of Object.entries(EXPRESS_AS_STYLE_CATEGORIES) as [
    keyof typeof EXPRESS_AS_STYLE_CATEGORIES,
    readonly string[],
  ][]) {
    if (styles.includes(style)) {
      return category;
    }
  }

  return "other";
}

export const VOICE_STYLE_MAP = {
  "ja-JP-MayuNeural": ["calm", "cheerful", "sad"],
  "ja-JP-KeitaNeural": ["chat"],
  "ja-JP-NanamiNeural": ["chat", "customerservice", "cheerful", "whispering", "sad"],
  "en-US-JennyMultilingualNeural": [
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
  "en-US-AndrewNeural": ["empathetic", "relieved"],
  "en-US-JennyNeural": [
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
  "en-US-GuyNeural": [
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
  "ko-KR-SunHiNeural": ["cheerful", "sad"],
  "zh-CN-XiaoxiaoNeural": [
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
  "zh-CN-YunxiNeural": [
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
  "fr-FR-DeniseNeural": ["cheerful", "sad"],
  "fr-FR-HenriNeural": ["cheerful", "sad"],
  "pt-BR-FranciscaNeural": ["calm"],
  "it-IT-ElsaNeural": ["cheerful", "sad"],
  "de-DE-KatjaNeural": ["cheerful", "sad"],
  "de-DE-ConradNeural": ["cheerful", "sad"],
  "ru-RU-SvetlanaNeural": ["cheerful", "sad", "angry", "disgruntled", "embarrassed", "fearful"],
} as const satisfies Readonly<Record<string, readonly ExpressAsStyle[]>>;

const VOICE_STYLE_MAP_BY_NORMALIZED_NAME = new Map<string, readonly ExpressAsStyle[]>(
  Object.entries(VOICE_STYLE_MAP).map(([voiceName, styles]) => [voiceName.toLowerCase(), styles]),
);

export function resolveExpressAsStyles(
  voiceName: string | null | undefined,
  candidates: readonly string[] = EXPRESS_AS_STYLE_PRESETS,
): readonly string[] {
  const normalizedVoiceName = voiceName?.trim().toLowerCase();
  if (!normalizedVoiceName) {
    return candidates;
  }

  const supportedStyles = VOICE_STYLE_MAP_BY_NORMALIZED_NAME.get(normalizedVoiceName);
  if (supportedStyles === undefined) {
    return [];
  }

  const supportedStyleSet = new Set<string>(supportedStyles);
  return candidates.filter((style) => supportedStyleSet.has(style));
}
export const EXPRESS_AS_ROLE_PRESETS = [
  "Girl",
  "Boy",
  "YoungAdultFemale",
  "YoungAdultMale",
  "OlderAdultFemale",
  "OlderAdultMale",
  "SeniorFemale",
  "SeniorMale",
] as const;
export const EMPHASIS_LEVEL_PRESETS = ["strong", "moderate", "reduced", "none"] as const;
export const SAY_AS_PRESETS = [
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
] as const;
export const LANGUAGE_PRESETS = ["ja-JP", "en-US", "de-DE", "fr-FR"] as const;
export const SILENCE_VALUE_PRESETS = ["300ms", "500ms", "1s"] as const;
export const SILENCE_TYPE_PRESETS = [
  "Leading",
  "Tailing",
  "Sentenceboundary",
  "Comma",
  "Semicolon",
  "Enumerationcomma",
] as const;
export const PHONEME_ALPHABET_PRESETS = ["ipa", "sapi", "ups", "x-sampa"] as const;
export const VISEME_TYPE_PRESETS = ["redlips_front", "FacialExpression"] as const;

export const SSML_ATTRIBUTE_PRESETS = {
  break: {
    strength: BREAK_STRENGTH_PRESETS,
    time: BREAK_TIME_PRESETS,
  },
  prosody: {
    rate: PROSODY_RATE_PRESETS,
    pitch: PROSODY_PITCH_PRESETS,
    volume: PROSODY_VOLUME_PRESETS,
  },
  "mstts:express-as": {
    style: EXPRESS_AS_STYLE_PRESETS,
    role: EXPRESS_AS_ROLE_PRESETS,
  },
  "express-as": {
    style: EXPRESS_AS_STYLE_PRESETS,
    role: EXPRESS_AS_ROLE_PRESETS,
  },
  expressAs: {
    style: EXPRESS_AS_STYLE_PRESETS,
    role: EXPRESS_AS_ROLE_PRESETS,
  },
  "say-as": {
    "interpret-as": SAY_AS_PRESETS,
  },
  sayAs: {
    "interpret-as": SAY_AS_PRESETS,
  },
  emphasis: {
    level: EMPHASIS_LEVEL_PRESETS,
  },
  lang: {
    "xml:lang": LANGUAGE_PRESETS,
  },
  phoneme: {
    alphabet: PHONEME_ALPHABET_PRESETS,
  },
  "mstts:silence": {
    type: SILENCE_TYPE_PRESETS,
    value: SILENCE_VALUE_PRESETS,
  },
  silence: {
    type: SILENCE_TYPE_PRESETS,
    value: SILENCE_VALUE_PRESETS,
  },
  "mstts:viseme": {
    type: VISEME_TYPE_PRESETS,
  },
  viseme: {
    type: VISEME_TYPE_PRESETS,
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

export const SSML_PRESET_EXAMPLES = {
  breakTime: "500ms",
  prosodyRate: "fast",
  prosodyPitch: "+2st",
  prosodyVolume: "loud",
  expressAsStyle: "cheerful",
  phonemeAlphabet: "ipa",
  silenceValue: "300ms",
} as const satisfies {
  breakTime: (typeof BREAK_TIME_PRESETS)[number];
  prosodyRate: (typeof PROSODY_RATE_PRESETS)[number];
  prosodyPitch: (typeof PROSODY_PITCH_PRESETS)[number];
  prosodyVolume: (typeof PROSODY_VOLUME_PRESETS)[number];
  expressAsStyle: (typeof EXPRESS_AS_STYLE_PRESETS)[number];
  phonemeAlphabet: (typeof PHONEME_ALPHABET_PRESETS)[number];
  silenceValue: (typeof SILENCE_VALUE_PRESETS)[number];
};

export const BREAK_TIME_DESCRIPTIONS = {
  "500ms": {
    ja: "500ミリ秒の無音",
    en: "Inserts 500 milliseconds of silence.",
  },
  "1s": {
    ja: "1秒の無音",
    en: "Inserts one second of silence.",
  },
  "2s": {
    ja: "2秒の無音",
    en: "Inserts two seconds of silence.",
  },
  "3s": {
    ja: "3秒の無音",
    en: "Inserts three seconds of silence.",
  },
} as const satisfies Readonly<Record<(typeof BREAK_TIME_PRESETS)[number], SsmlPresetDescription>>;

export const EMPHASIS_LEVEL_DESCRIPTIONS = {
  strong: {
    ja: "強い強調",
    en: "Applies strong emphasis.",
  },
  moderate: {
    ja: "中程度の強調",
    en: "Applies moderate emphasis.",
  },
  reduced: {
    ja: "弱めの強調",
    en: "Applies reduced emphasis.",
  },
  none: {
    ja: "強調なし",
    en: "Applies no emphasis.",
  },
} as const satisfies Readonly<Record<(typeof EMPHASIS_LEVEL_PRESETS)[number], SsmlPresetDescription>>;

export const PROSODY_RATE_DESCRIPTIONS = {
  "x-slow": {
    ja: "最も遅い速度",
    en: "Uses the slowest speech rate.",
  },
  slow: {
    ja: "遅い速度",
    en: "Uses a slow speech rate.",
  },
  medium: {
    ja: "標準的な速度",
    en: "Uses the standard speech rate.",
  },
  fast: {
    ja: "速い速度",
    en: "Uses a fast speech rate.",
  },
  "x-fast": {
    ja: "最も速い速度",
    en: "Uses the fastest speech rate.",
  },
} as const satisfies Readonly<Record<(typeof PROSODY_RATE_PRESETS)[number], SsmlPresetDescription>>;

export const PROSODY_PITCH_DESCRIPTIONS = {
  "+2st": {
    ja: "基準の声の高さより2半音上",
    en: "Raises the pitch by two semitones.",
  },
  "-2st": {
    ja: "基準の声の高さより2半音下",
    en: "Lowers the pitch by two semitones.",
  },
  "0st": {
    ja: "基準の声の高さ",
    en: "Keeps the baseline pitch.",
  },
  "+4st": {
    ja: "基準の声の高さより4半音上",
    en: "Raises the pitch by four semitones.",
  },
  "-4st": {
    ja: "基準の声の高さより4半音下",
    en: "Lowers the pitch by four semitones.",
  },
  "+8st": {
    ja: "基準の声の高さより8半音上",
    en: "Raises the pitch by eight semitones.",
  },
  "-8st": {
    ja: "基準の声の高さより8半音下",
    en: "Lowers the pitch by eight semitones.",
  },
  "+12st": {
    ja: "基準の声の高さより12半音上",
    en: "Raises the pitch by twelve semitones.",
  },
  "-12st": {
    ja: "基準の声の高さより12半音下",
    en: "Lowers the pitch by twelve semitones.",
  },
} as const satisfies Readonly<Record<(typeof PROSODY_PITCH_PRESETS)[number], SsmlPresetDescription>>;

export const PROSODY_VOLUME_DESCRIPTIONS = {
  silent: {
    ja: "無音",
    en: "Makes the selected text silent.",
  },
  "x-soft": {
    ja: "最も小さい音量",
    en: "Uses the quietest volume.",
  },
  soft: {
    ja: "小さい音量",
    en: "Uses a soft volume.",
  },
  medium: {
    ja: "標準的な音量",
    en: "Uses the standard volume.",
  },
  loud: {
    ja: "大きい音量",
    en: "Uses a loud volume.",
  },
  "x-loud": {
    ja: "最も大きい音量",
    en: "Uses the loudest volume.",
  },
} as const satisfies Readonly<Record<(typeof PROSODY_VOLUME_PRESETS)[number], SsmlPresetDescription>>;

export const EXPRESS_AS_STYLE_DESCRIPTIONS = {
  cheerful: {
    ja: "明るく元気なスタイル",
    en: "Uses a cheerful style.",
  },
  friendly: {
    ja: "親しみやすいスタイル",
    en: "Uses a friendly style.",
  },
  calm: {
    ja: "穏やかなスタイル",
    en: "Uses a calm style.",
  },
  sad: {
    ja: "悲しげなスタイル",
    en: "Uses a sad style.",
  },
  angry: {
    ja: "怒ったようなスタイル",
    en: "Uses an angry style.",
  },
  excited: {
    ja: "興奮したスタイル",
    en: "Uses an excited style.",
  },
  empathetic: {
    ja: "共感を示すスタイル",
    en: "Uses an empathetic style.",
  },
  relieved: {
    ja: "安心したスタイル",
    en: "Uses a relieved style.",
  },
  fearful: {
    ja: "恐れを感じさせるスタイル",
    en: "Uses a fearful style.",
  },
  depressed: {
    ja: "落ち込んだスタイル",
    en: "Uses a depressed style.",
  },
  disgruntled: {
    ja: "不満を感じさせるスタイル",
    en: "Uses a disgruntled style.",
  },
  embarrassed: {
    ja: "恥ずかしそうなスタイル",
    en: "Uses an embarrassed style.",
  },
  serious: {
    ja: "真剣なスタイル",
    en: "Uses a serious style.",
  },
  assistant: {
    ja: "デジタルアシスタント向けのスタイル",
    en: "Uses a digital assistant style.",
  },
  chat: {
    ja: "会話向けのスタイル",
    en: "Uses a conversational style.",
  },
  customerservice: {
    ja: "カスタマーサービス向けのスタイル",
    en: "Uses a customer service style.",
  },
  hopeful: {
    ja: "希望に満ちたスタイル",
    en: "Uses a hopeful style.",
  },
  newscast: {
    ja: "ニュース読み上げ向けのスタイル",
    en: "Uses a newscast style.",
  },
  shouting: {
    ja: "叫ぶようなスタイル",
    en: "Uses a shouting style.",
  },
  terrified: {
    ja: "恐怖に満ちたスタイル",
    en: "Uses a terrified style.",
  },
  unfriendly: {
    ja: "無愛想なスタイル",
    en: "Uses an unfriendly style.",
  },
  whispering: {
    ja: "ささやくようなスタイル",
    en: "Uses a whispering style.",
  },
  "narration-relaxed": {
    ja: "リラックスしたナレーション向けのスタイル",
    en: "Uses a relaxed narration style.",
  },
  "poetry-reading": {
    ja: "詩の朗読向けのスタイル",
    en: "Uses a poetry-reading style.",
  },
  sports_commentary: {
    ja: "スポーツ実況向けのスタイル",
    en: "Uses a sports commentary style.",
  },
  sports_commentary_excited: {
    ja: "興奮したスポーツ実況向けのスタイル",
    en: "Uses an excited sports commentary style.",
  },
  story: {
    ja: "物語の朗読向けのスタイル",
    en: "Uses a storytelling style.",
  },
} as const satisfies Readonly<Record<(typeof EXPRESS_AS_STYLE_PRESETS)[number], SsmlPresetDescription>>;

export const SAY_AS_DESCRIPTIONS = {
  characters: {
    ja: "1文字ずつの読み上げ",
    en: "Speaks the characters one by one.",
  },
  "spell-out": {
    ja: "綴りの読み上げ（1文字ずつ）",
    en: "Spells out the text character by character.",
  },
  cardinal: {
    ja: "基数としての読み上げ",
    en: "Speaks the value as a cardinal number.",
  },
  ordinal: {
    ja: "序数としての読み上げ",
    en: "Speaks the value as an ordinal number.",
  },
  number: {
    ja: "数値としての読み上げ",
    en: "Speaks the value as a number.",
  },
  date: {
    ja: "日付としての読み上げ",
    en: "Speaks the value as a date.",
  },
  time: {
    ja: "時刻としての読み上げ",
    en: "Speaks the value as a time.",
  },
  telephone: {
    ja: "電話番号としての読み上げ",
    en: "Speaks the value as a telephone number.",
  },
  fraction: {
    ja: "分数としての読み上げ",
    en: "Speaks the value as a fraction.",
  },
  address: {
    ja: "住所としての読み上げ",
    en: "Speaks the value as an address.",
  },
  name: {
    ja: "名前としての読み上げ",
    en: "Speaks the value as a name.",
  },
  currency: {
    ja: "通貨としての読み上げ",
    en: "Speaks the value as currency.",
  },
} as const satisfies Readonly<Record<(typeof SAY_AS_PRESETS)[number], SsmlPresetDescription>>;

export const LANGUAGE_DESCRIPTIONS = {
  "ja-JP": {
    ja: "日本語（日本）で読み上げます。",
    en: "Speaks the text in Japanese (Japan).",
  },
  "en-US": {
    ja: "英語（米国）で読み上げます。",
    en: "Speaks the text in English (United States).",
  },
  "de-DE": {
    ja: "ドイツ語（ドイツ）で読み上げます。",
    en: "Speaks the text in German (Germany).",
  },
  "fr-FR": {
    ja: "フランス語（フランス）で読み上げます。",
    en: "Speaks the text in French (France).",
  },
} as const satisfies Readonly<Record<(typeof LANGUAGE_PRESETS)[number], SsmlPresetDescription>>;

export const SILENCE_VALUE_DESCRIPTIONS = {
  "300ms": {
    ja: "先頭に300ミリ秒の無音を挿入します。",
    en: "Inserts 300 milliseconds of leading silence.",
  },
  "500ms": {
    ja: "先頭に500ミリ秒の無音を挿入します。",
    en: "Inserts 500 milliseconds of leading silence.",
  },
  "1s": {
    ja: "先頭に1秒の無音を挿入します。",
    en: "Inserts one second of leading silence.",
  },
} as const satisfies Readonly<Record<(typeof SILENCE_VALUE_PRESETS)[number], SsmlPresetDescription>>;
