"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildSsml, parseSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import type { SsmlNode } from "@ssml-builder-js/ssml-core";
import { defineSsmlEditorElement } from "@ssml-builder-js/ssml-editor-elements";
import type { SsmlEditorChangeDetail, SsmlEditorElement } from "@ssml-builder-js/ssml-editor-elements";
import { SsmlEditor } from "@ssml-builder-js/ssml-editor-react";
import type { SsmlEditorRef } from "@ssml-builder-js/ssml-editor-react";

type SpeechLanguage = "ja-JP" | "en-US" | "ko" | "zh-Hans" | "fr" | "pt-BR" | "it" | "de" | "ru";
type SpeechGender = "female" | "male";
type PlaygroundLocale = "ja" | "en" | "ko" | "zh-Hans" | "fr" | "pt-BR" | "it" | "de" | "ru";
type PlaygroundTheme = "light" | "dark";
type EditorMode = "react" | "web-component";

const THEME_STORAGE_KEY = "ssml-builder-playground-theme";

const EDITOR_MODE_OPTIONS = [
  { value: "react", label: "React Component" },
  { value: "web-component", label: "Web Component" },
] as const satisfies ReadonlyArray<{ value: EditorMode; label: string }>;

const VOICE_NAMES = {
  "ja-JP": {
    female: "ja-JP-NanamiNeural",
    male: "ja-JP-KeitaNeural",
  },
  "en-US": {
    female: "en-US-JennyNeural",
    male: "en-US-GuyNeural",
  },
  ko: {
    female: "ko-KR-SunHiNeural",
    male: "ko-KR-InJoonNeural",
  },
  "zh-Hans": {
    female: "zh-CN-XiaoxiaoNeural",
    male: "zh-CN-YunxiNeural",
  },
  fr: {
    female: "fr-FR-DeniseNeural",
    male: "fr-FR-HenriNeural",
  },
  "pt-BR": {
    female: "pt-BR-FranciscaNeural",
    male: "pt-BR-AntonioNeural",
  },
  it: {
    female: "it-IT-ElsaNeural",
    male: "it-IT-DiegoNeural",
  },
  de: {
    female: "de-DE-KatjaNeural",
    male: "de-DE-ConradNeural",
  },
  ru: {
    female: "ru-RU-SvetlanaNeural",
    male: "ru-RU-DmitryNeural",
  },
} satisfies Record<SpeechLanguage, Record<SpeechGender, string>>;

const LOCALE_OPTIONS = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "fr", label: "Français" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
] as const satisfies ReadonlyArray<{ value: PlaygroundLocale; label: string }>;

const GENDER_OPTIONS = [
  {
    value: "female",
    labels: {
      ja: "女性",
      en: "Female",
      ko: "여성",
      "zh-Hans": "女性",
      fr: "Féminin",
      "pt-BR": "Feminino",
      it: "Femminile",
      de: "Weiblich",
      ru: "Женский",
    },
  },
  {
    value: "male",
    labels: {
      ja: "男性",
      en: "Male",
      ko: "남성",
      "zh-Hans": "男性",
      fr: "Masculin",
      "pt-BR": "Masculino",
      it: "Maschile",
      de: "Männlich",
      ru: "Мужской",
    },
  },
] as const;

const LANGUAGE_OPTIONS = [
  {
    value: "en-US",
    labels: {
      ja: "英語 (en-US)",
      en: "English (en-US)",
      ko: "영어 (en-US)",
      "zh-Hans": "英语 (en-US)",
      fr: "Anglais (en-US)",
      "pt-BR": "Inglês (en-US)",
      it: "Inglese (en-US)",
      de: "Englisch (en-US)",
      ru: "Английский (en-US)",
    },
  },
  {
    value: "ja-JP",
    labels: {
      ja: "日本語 (ja-JP)",
      en: "Japanese (ja-JP)",
      ko: "일본어 (ja-JP)",
      "zh-Hans": "日语 (ja-JP)",
      fr: "Japonais (ja-JP)",
      "pt-BR": "Japonês (ja-JP)",
      it: "Giapponese (ja-JP)",
      de: "Japanisch (ja-JP)",
      ru: "Японский (ja-JP)",
    },
  },
  {
    value: "ko",
    labels: {
      ja: "韓国語 (ko)",
      en: "Korean (ko)",
      ko: "한국어 (ko)",
      "zh-Hans": "韩语 (ko)",
      fr: "Coréen (ko)",
      "pt-BR": "Coreano (ko)",
      it: "Coreano (ko)",
      de: "Koreanisch (ko)",
      ru: "Корейский (ko)",
    },
  },
  {
    value: "zh-Hans",
    labels: {
      ja: "中国語 簡体字 (zh-Hans)",
      en: "Simplified Chinese (zh-Hans)",
      ko: "중국어 간체 (zh-Hans)",
      "zh-Hans": "简体中文 (zh-Hans)",
      fr: "Chinois simplifié (zh-Hans)",
      "pt-BR": "Chinês simplificado (zh-Hans)",
      it: "Cinese semplificato (zh-Hans)",
      de: "Vereinfachtes Chinesisch (zh-Hans)",
      ru: "Китайский (упрощённый) (zh-Hans)",
    },
  },
  {
    value: "fr",
    labels: {
      ja: "フランス語 (fr)",
      en: "French (fr)",
      ko: "프랑스어 (fr)",
      "zh-Hans": "法语 (fr)",
      fr: "Français (fr)",
      "pt-BR": "Francês (fr)",
      it: "Francese (fr)",
      de: "Französisch (fr)",
      ru: "Французский (fr)",
    },
  },
  {
    value: "pt-BR",
    labels: {
      ja: "ポルトガル語 (pt-BR)",
      en: "Portuguese (pt-BR)",
      ko: "포르투갈어 (pt-BR)",
      "zh-Hans": "葡萄牙语 (pt-BR)",
      fr: "Portugais (pt-BR)",
      "pt-BR": "Português (pt-BR)",
      it: "Portoghese (pt-BR)",
      de: "Portugiesisch (pt-BR)",
      ru: "Португальский (pt-BR)",
    },
  },
  {
    value: "it",
    labels: {
      ja: "イタリア語 (it)",
      en: "Italian (it)",
      ko: "이탈리아어 (it)",
      "zh-Hans": "意大利语 (it)",
      fr: "Italien (it)",
      "pt-BR": "Italiano (it)",
      it: "Italiano (it)",
      de: "Italienisch (it)",
      ru: "Итальянский (it)",
    },
  },
  {
    value: "de",
    labels: {
      ja: "ドイツ語 (de)",
      en: "German (de)",
      ko: "독일어 (de)",
      "zh-Hans": "德语 (de)",
      fr: "Allemand (de)",
      "pt-BR": "Alemão (de)",
      it: "Tedesco (de)",
      de: "Deutsch (de)",
      ru: "Немецкий (de)",
    },
  },
  {
    value: "ru",
    labels: {
      ja: "ロシア語 (ru)",
      en: "Russian (ru)",
      ko: "러시아어 (ru)",
      "zh-Hans": "俄语 (ru)",
      fr: "Russe (ru)",
      "pt-BR": "Russo (ru)",
      it: "Russo (ru)",
      de: "Russisch (ru)",
      ru: "Русский (ru)",
    },
  },
] as const;

type PlaygroundCopy = {
  localeLabel: string;
  playgroundTitle: string;
  themeLabel: string;
  editorMode: string;
  webComponentEditor: string;
  introDescription: string;
  speechSettings: string;
  speechLanguage: string;
  speechGender: string;
  voice: string;
  audioPreview: string;
  audioDescription: string;
  generateAudio: string;
  generatingAudio: string;
  generatedAudio: string;
  generatedSsml: string;
  ssmlTextTrack: string;
  unsupportedAudio: string;
  generatedSpeechFallback: string;
  audioError: (status: number) => string;
  synthesisError: string;
};

const PLAYGROUND_COPY: Readonly<Record<PlaygroundLocale, PlaygroundCopy>> = {
  ja: {
    localeLabel: "表示言語",
    playgroundTitle: "Playground",
    themeLabel: "ダークモード",
    editorMode: "エディターモード",
    webComponentEditor: "SSML Web Component エディター",
    introDescription: "以下のサンプルドキュメントを編集して、SSML エディターとコアパッケージを確認できます。",
    speechSettings: "音声設定",
    speechLanguage: "音声言語",
    speechGender: "性別",
    voice: "音声",
    audioPreview: "音声プレビュー",
    audioDescription: "現在の SSML から音声を生成して、ブラウザーで再生できます。",
    generateAudio: "音声を生成",
    generatingAudio: "音声を生成中...",
    generatedAudio: "生成された音声",
    generatedSsml: "生成された SSML",
    ssmlTextTrack: "SSML テキスト",
    unsupportedAudio: "お使いのブラウザーは音声再生に対応していません。",
    generatedSpeechFallback: "生成された音声",
    audioError: (status) => `音声の生成に失敗しました (${status})。`,
    synthesisError: "音声の生成に失敗しました。",
  },
  en: {
    localeLabel: "Display language",
    playgroundTitle: "Playground",
    themeLabel: "Dark mode",
    editorMode: "Editor mode",
    webComponentEditor: "SSML Web Component editor",
    introDescription: "Edit the sample document below to verify the SSML editor and core package together.",
    speechSettings: "Speech settings",
    speechLanguage: "Language",
    speechGender: "Gender",
    voice: "Voice",
    audioPreview: "Audio preview",
    audioDescription: "Generate audio from the current SSML and listen to it in the browser.",
    generateAudio: "Generate audio",
    generatingAudio: "Generating audio...",
    generatedAudio: "Generated speech audio",
    generatedSsml: "Generated SSML",
    ssmlTextTrack: "SSML text",
    unsupportedAudio: "Your browser does not support audio playback.",
    generatedSpeechFallback: "Generated speech",
    audioError: (status) => `Audio generation failed (${status}).`,
    synthesisError: "Audio generation failed.",
  },
  ko: {
    localeLabel: "표시 언어",
    playgroundTitle: "Playground",
    themeLabel: "다크 모드",
    editorMode: "편집기 모드",
    webComponentEditor: "SSML Web Component 편집기",
    introDescription: "아래 샘플 문서를 편집하여 SSML 편집기와 코어 패키지를 함께 확인할 수 있습니다.",
    speechSettings: "음성 설정",
    speechLanguage: "음성 언어",
    speechGender: "성별",
    voice: "음성",
    audioPreview: "오디오 미리 듣기",
    audioDescription: "현재 SSML에서 오디오를 생성하여 브라우저에서 들어볼 수 있습니다.",
    generateAudio: "오디오 생성",
    generatingAudio: "오디오 생성 중...",
    generatedAudio: "생성된 음성 오디오",
    generatedSsml: "생성된 SSML",
    ssmlTextTrack: "SSML 텍스트",
    unsupportedAudio: "브라우저가 오디오 재생을 지원하지 않습니다.",
    generatedSpeechFallback: "생성된 음성",
    audioError: (status) => `오디오 생성에 실패했습니다 (${status}).`,
    synthesisError: "오디오 생성에 실패했습니다.",
  },
  "zh-Hans": {
    localeLabel: "显示语言",
    playgroundTitle: "Playground",
    themeLabel: "深色模式",
    editorMode: "编辑器模式",
    webComponentEditor: "SSML Web Component 编辑器",
    introDescription: "编辑下面的示例文档，以同时查看 SSML 编辑器和核心包。",
    speechSettings: "语音设置",
    speechLanguage: "语音语言",
    speechGender: "性别",
    voice: "语音",
    audioPreview: "音频预览",
    audioDescription: "从当前 SSML 生成音频并在浏览器中播放。",
    generateAudio: "生成音频",
    generatingAudio: "正在生成音频...",
    generatedAudio: "生成的语音音频",
    generatedSsml: "生成的 SSML",
    ssmlTextTrack: "SSML 文本",
    unsupportedAudio: "您的浏览器不支持音频播放。",
    generatedSpeechFallback: "生成的语音",
    audioError: (status) => `音频生成失败（${status}）。`,
    synthesisError: "音频生成失败。",
  },
  fr: {
    localeLabel: "Langue d’affichage",
    playgroundTitle: "Playground",
    themeLabel: "Mode sombre",
    editorMode: "Mode de l’éditeur",
    webComponentEditor: "Éditeur SSML Web Component",
    introDescription:
      "Modifiez le document d’exemple ci-dessous pour vérifier l’éditeur SSML et le package principal ensemble.",
    speechSettings: "Paramètres vocaux",
    speechLanguage: "Langue vocale",
    speechGender: "Genre",
    voice: "Voix",
    audioPreview: "Aperçu audio",
    audioDescription: "Générez de l’audio à partir du SSML actuel et écoutez-le dans le navigateur.",
    generateAudio: "Générer l’audio",
    generatingAudio: "Génération de l’audio...",
    generatedAudio: "Audio vocal généré",
    generatedSsml: "SSML généré",
    ssmlTextTrack: "Texte SSML",
    unsupportedAudio: "Votre navigateur ne prend pas en charge la lecture audio.",
    generatedSpeechFallback: "Voix générée",
    audioError: (status) => `Échec de la génération audio (${status}).`,
    synthesisError: "Échec de la génération audio.",
  },
  "pt-BR": {
    localeLabel: "Idioma de exibição",
    playgroundTitle: "Playground",
    themeLabel: "Modo escuro",
    editorMode: "Modo do editor",
    webComponentEditor: "Editor SSML Web Component",
    introDescription:
      "Edite o documento de exemplo abaixo para verificar o editor SSML e o pacote principal em conjunto.",
    speechSettings: "Configurações de voz",
    speechLanguage: "Idioma da voz",
    speechGender: "Gênero",
    voice: "Voz",
    audioPreview: "Prévia do áudio",
    audioDescription: "Gere áudio a partir do SSML atual e ouça-o no navegador.",
    generateAudio: "Gerar áudio",
    generatingAudio: "Gerando áudio...",
    generatedAudio: "Áudio de fala gerado",
    generatedSsml: "SSML gerado",
    ssmlTextTrack: "Texto SSML",
    unsupportedAudio: "Seu navegador não é compatível com reprodução de áudio.",
    generatedSpeechFallback: "Fala gerada",
    audioError: (status) => `Falha ao gerar áudio (${status}).`,
    synthesisError: "Falha ao gerar áudio.",
  },
  it: {
    localeLabel: "Lingua di visualizzazione",
    playgroundTitle: "Playground",
    themeLabel: "Modalità scura",
    editorMode: "Modalità editor",
    webComponentEditor: "Editor SSML Web Component",
    introDescription:
      "Modifica il documento di esempio qui sotto per verificare insieme l’editor SSML e il pacchetto principale.",
    speechSettings: "Impostazioni vocali",
    speechLanguage: "Lingua vocale",
    speechGender: "Genere",
    voice: "Voce",
    audioPreview: "Anteprima audio",
    audioDescription: "Genera audio dall’SSML corrente e ascoltalo nel browser.",
    generateAudio: "Genera audio",
    generatingAudio: "Generazione audio...",
    generatedAudio: "Audio vocale generato",
    generatedSsml: "SSML generato",
    ssmlTextTrack: "Testo SSML",
    unsupportedAudio: "Il browser non supporta la riproduzione audio.",
    generatedSpeechFallback: "Voce generata",
    audioError: (status) => `Generazione audio non riuscita (${status}).`,
    synthesisError: "Generazione audio non riuscita.",
  },
  de: {
    localeLabel: "Anzeigesprache",
    playgroundTitle: "Playground",
    themeLabel: "Dunkelmodus",
    editorMode: "Editormodus",
    webComponentEditor: "SSML-Web-Component-Editor",
    introDescription:
      "Bearbeiten Sie das Beispieldokument unten, um den SSML-Editor und das Kernpaket gemeinsam zu prüfen.",
    speechSettings: "Spracheinstellungen",
    speechLanguage: "Sprache",
    speechGender: "Geschlecht",
    voice: "Stimme",
    audioPreview: "Audiovorschau",
    audioDescription: "Erzeugen Sie Audio aus dem aktuellen SSML und hören Sie es im Browser an.",
    generateAudio: "Audio erzeugen",
    generatingAudio: "Audio wird erzeugt...",
    generatedAudio: "Erzeugtes Sprach-Audio",
    generatedSsml: "Erzeugtes SSML",
    ssmlTextTrack: "SSML-Text",
    unsupportedAudio: "Ihr Browser unterstützt keine Audiowiedergabe.",
    generatedSpeechFallback: "Erzeugte Sprache",
    audioError: (status) => `Audioerzeugung fehlgeschlagen (${status}).`,
    synthesisError: "Audioerzeugung fehlgeschlagen.",
  },
  ru: {
    localeLabel: "Язык интерфейса",
    playgroundTitle: "Playground",
    themeLabel: "Тёмный режим",
    editorMode: "Режим редактора",
    webComponentEditor: "Редактор SSML Web Component",
    introDescription:
      "Измените расположенный ниже пример документа, чтобы проверить работу редактора SSML и основного пакета вместе.",
    speechSettings: "Настройки речи",
    speechLanguage: "Язык речи",
    speechGender: "Пол",
    voice: "Голос",
    audioPreview: "Предпросмотр аудио",
    audioDescription: "Создайте аудио из текущего SSML и прослушайте его в браузере.",
    generateAudio: "Создать аудио",
    generatingAudio: "Создание аудио...",
    generatedAudio: "Созданное речевое аудио",
    generatedSsml: "Созданный SSML",
    ssmlTextTrack: "Текст SSML",
    unsupportedAudio: "Ваш браузер не поддерживает воспроизведение аудио.",
    generatedSpeechFallback: "Созданная речь",
    audioError: (status) => `Не удалось создать аудио (${status}).`,
    synthesisError: "Не удалось создать аудио.",
  },
};

const initialDocument: SsmlDocument = {
  type: "speak",
  version: "1.0",
  lang: "en-US",
  children: [
    {
      type: "voice",
      name: "en-US-JennyNeural",
      children: [
        {
          type: "prosody",
          rate: "medium",
          volume: "medium",
          children: ["Welcome to the SSML Builder playground."],
        },
      ],
    },
  ],
};

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function getNodeText(node: SsmlNode): string {
  if (typeof node === "string") {
    return node;
  }

  if (node.type === "text") {
    return node.value;
  }

  return (node.children ?? []).map(getNodeText).join("");
}

function createCaptionTrack(document: SsmlDocument, fallbackText: string): string {
  const text =
    getDocumentChildren(document).map(getNodeText).join("").trim().replace(/\s+/g, " ").replaceAll("-->", "-- >") ||
    fallbackText;
  const webVtt = `WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n${text}`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(webVtt)}`;
}

function createCaptionTrackFromSsml(ssml: string, fallbackDocument: SsmlDocument, fallbackText: string): string {
  try {
    return createCaptionTrack(parseSsml(ssml), fallbackText);
  } catch {
    return createCaptionTrack(fallbackDocument, fallbackText);
  }
}

function updateFirstVoice(nodes: SsmlNode[], voiceName: string): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || typeof node === "string" || node.type === "text") {
      return node;
    }

    if (node.type === "voice") {
      updated = true;
      return { ...node, name: voiceName };
    }

    if (node.children) {
      const result = updateFirstVoice(node.children, voiceName);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function updateSpeechSettings(document: SsmlDocument, language: SpeechLanguage, gender: SpeechGender): SsmlDocument {
  const voiceName = VOICE_NAMES[language][gender];
  const children = getDocumentChildren(document);
  const voiceResult = updateFirstVoice(children, voiceName);
  const nextChildren = voiceResult.updated
    ? voiceResult.nodes
    : [
        {
          type: "voice" as const,
          name: voiceName,
          children: children.length > 0 ? children : [""],
        },
      ];
  const nextDocument: SsmlDocument = {
    ...document,
    lang: language,
    children: nextChildren,
  };

  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }

  return nextDocument;
}

async function getSynthesisError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {}

  return fallbackMessage;
}

function getStoredTheme(): PlaygroundTheme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: PlaygroundTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

export default function Home() {
  const [document, setDocument] = useState<SsmlDocument>(initialDocument);
  const [locale, setLocale] = useState<PlaygroundLocale>("ja");
  const [selectedLanguage, setSelectedLanguage] = useState<SpeechLanguage>("en-US");
  const [selectedGender, setSelectedGender] = useState<SpeechGender>("female");
  const [editorMode, setEditorMode] = useState<EditorMode>("react");
  const [editorValue, setEditorValue] = useState(() => buildSsml(initialDocument));
  const [theme, setTheme] = useState<PlaygroundTheme | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioCaptionTrack, setAudioCaptionTrack] = useState<string | null>(null);
  const [audioCaptionLanguage, setAudioCaptionLanguage] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const editorRef = useRef<SsmlEditorRef>(null);
  const webComponentRef = useRef<SsmlEditorElement>(null);
  const hasManualThemeRef = useRef(false);
  const copy = PLAYGROUND_COPY[locale];
  const editorLocale = locale === "ja" ? "ja" : "en";
  const ssml = editorMode === "web-component" ? editorValue : buildSsml(document);
  const selectedVoice = VOICE_NAMES[selectedLanguage][selectedGender];
  const currentCaptionTrack =
    editorMode === "web-component"
      ? createCaptionTrackFromSsml(ssml, document, copy.generatedSpeechFallback)
      : createCaptionTrack(document, copy.generatedSpeechFallback);
  const captionTrackSource = audioCaptionTrack ?? currentCaptionTrack;
  const captionLanguage = audioCaptionLanguage ?? document.lang;

  const handleWebComponentChange = useCallback((event: Event): void => {
    const detail = (event as CustomEvent<SsmlEditorChangeDetail>).detail;
    if (!detail || typeof detail.value !== "string") {
      return;
    }

    setEditorValue(detail.value);
    try {
      setDocument(parseSsml(detail.value));
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    defineSsmlEditorElement();
  }, []);

  useEffect(() => {
    setEditorValue(buildSsml(document));
  }, [document]);

  useEffect(() => {
    const editor = webComponentRef.current;
    if (editorMode !== "web-component" || !editor) {
      return;
    }

    editor.addEventListener("change", handleWebComponentChange);
    return () => editor.removeEventListener("change", handleWebComponentChange);
  }, [editorMode, handleWebComponentChange]);

  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    if (storedTheme !== null) {
      hasManualThemeRef.current = true;
      setTheme(storedTheme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = (isDark: boolean): void => {
      if (!hasManualThemeRef.current) {
        setTheme(isDark ? "dark" : "light");
      }
    };
    const handleChange = (event: MediaQueryListEvent): void => updateTheme(event.matches);

    updateTheme(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (theme === null) {
      return;
    }

    if (!hasManualThemeRef.current) {
      globalThis.document.documentElement.removeAttribute("data-theme");
      return;
    }

    globalThis.document.documentElement.dataset.theme = theme;
  }, [theme]);

  const replaceAudioUrl = (nextAudioUrl: string | null): void => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
  };

  const toggleTheme = (): void => {
    if (theme === null) {
      return;
    }

    hasManualThemeRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    storeTheme(nextTheme);
  };

  const synthesizeAudio = async (
    requestSsml: string,
    requestCaptionTrack: string,
    requestCaptionLanguage: string,
  ): Promise<void> => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    setAudioCaptionTrack(null);
    setAudioCaptionLanguage(null);
    replaceAudioUrl(null);

    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ssml: requestSsml }),
      });

      if (!response.ok) {
        throw new Error(await getSynthesisError(response, copy.audioError(response.status)));
      }

      const audioBlob = await response.blob();
      setAudioCaptionTrack(requestCaptionTrack);
      setAudioCaptionLanguage(requestCaptionLanguage);
      replaceAudioUrl(URL.createObjectURL(audioBlob));
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : copy.synthesisError);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const generateAudio = (): void => {
    void synthesizeAudio(ssml, currentCaptionTrack, document.lang);
  };

  const previewSelectedAudio = (): void => {
    const selectedSsml = editorRef.current?.getSelectedSsml();
    if (!selectedSsml) {
      return;
    }

    void synthesizeAudio(
      selectedSsml,
      createCaptionTrackFromSsml(selectedSsml, document, copy.generatedSpeechFallback),
      document.lang,
    );
  };

  return (
    <main className="playground">
      <header className="intro">
        <div className="intro-heading">
          <div className="intro-title">
            <p className="eyebrow">SSML Builder</p>
            <h1>{copy.playgroundTitle}</h1>
          </div>
          <div className="intro-actions">
            <label className="locale-field" htmlFor="app-locale">
              <span>{copy.localeLabel}</span>
              <select
                id="app-locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value as PlaygroundLocale)}
              >
                {LOCALE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="theme-switch">
              <span id="theme-switch-label">{copy.themeLabel}</span>
              <button
                className="theme-switch-track"
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-labelledby="theme-switch-label"
                onClick={toggleTheme}
                disabled={theme === null}
              >
                <span className="theme-switch-thumb" />
              </button>
            </div>
          </div>
        </div>
        <p>{copy.introDescription}</p>
      </header>
      <fieldset className="editor-mode">
        <legend>{copy.editorMode}</legend>
        <div className="editor-mode-options">
          {EDITOR_MODE_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="editor-mode"
                value={option.value}
                checked={editorMode === option.value}
                onChange={() => setEditorMode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <section className="speech-settings" aria-labelledby="speech-settings-heading">
        <h2 id="speech-settings-heading">{copy.speechSettings}</h2>
        <div className="settings-fields">
          <label className="setting-field" htmlFor="speech-language">
            <span>{copy.speechLanguage}</span>
            <select
              id="speech-language"
              value={selectedLanguage}
              onChange={(event) => {
                const language = event.target.value as SpeechLanguage;
                setSelectedLanguage(language);
                setDocument((currentDocument) => updateSpeechSettings(currentDocument, language, selectedGender));
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labels[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-field" htmlFor="speech-gender">
            <span>{copy.speechGender}</span>
            <select
              id="speech-gender"
              value={selectedGender}
              onChange={(event) => {
                const gender = event.target.value as SpeechGender;
                setSelectedGender(gender);
                setDocument((currentDocument) => updateSpeechSettings(currentDocument, selectedLanguage, gender));
              }}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labels[locale]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="selected-voice">
          {copy.voice}: <code>{selectedVoice}</code>
        </p>
      </section>
      {editorMode === "react" ? (
        <SsmlEditor
          ref={editorRef}
          document={document}
          onChange={setDocument}
          onPreviewSelection={previewSelectedAudio}
          locale={editorLocale}
          theme={theme ?? "system"}
        />
      ) : (
        <section className="web-component-editor" aria-label={copy.webComponentEditor}>
          <ssml-editor
            ref={webComponentRef}
            value={editorValue}
            theme={theme === "dark" ? "vs-dark" : "light"}
            locale={editorLocale}
          />
        </section>
      )}
      <section className="audio-generation" aria-labelledby="audio-generation-heading">
        <h2 id="audio-generation-heading">{copy.audioPreview}</h2>
        <p>{copy.audioDescription}</p>
        <button
          className="generate-audio"
          type="button"
          onClick={generateAudio}
          disabled={isGeneratingAudio}
          aria-busy={isGeneratingAudio}
        >
          {isGeneratingAudio ? copy.generatingAudio : copy.generateAudio}
        </button>
        {audioError ? (
          <p className="audio-error" role="alert">
            {audioError}
          </p>
        ) : null}
        {audioUrl ? (
          <audio className="audio-player" controls autoPlay src={audioUrl} aria-label={copy.generatedAudio}>
            <track
              kind="captions"
              label={copy.ssmlTextTrack}
              src={captionTrackSource}
              srcLang={captionLanguage}
              default
            />
            {copy.unsupportedAudio}
          </audio>
        ) : null}
      </section>
      <section className="output" aria-labelledby="generated-ssml-heading">
        <h2 id="generated-ssml-heading">{copy.generatedSsml}</h2>
        <pre>
          <code>{ssml}</code>
        </pre>
      </section>
    </main>
  );
}
