export type SsmlEditorLocale = "ja" | "en";
export type SsmlEditorLanguage = SsmlEditorLocale;
export type SsmlEditorLocalizedText = Readonly<Record<SsmlEditorLocale, string>>;

export interface EditorCopy {
  editorAriaLabel: string;
  toolbarAriaLabel: string;
  undo: string;
  undoTitle: string;
  redo: string;
  redoTitle: string;
  clearAll: string;
  clearAllTitle: string;
  help: string;
  helpTitle: string;
  helpHeading: string;
  helpDescription: string;
  parameters: string;
  format: string;
  formatTitle: string;
  decorations: string;
  decorationsShowTitle: string;
  decorationsHideTitle: string;
  syntaxError: string;
  selectionActions: string;
  selectionCountSuffix: string;
  previewSelection: string;
  previewSelectionTitle: string;
  noAvailableOptions: string;
  categoryEmotions: string;
  categoryScenarios: string;
  categoryMedia: string;
  categoryOther: string;
}

export interface InlineBadgeCopy {
  pause: string;
  pitch: string;
  prosody: string;
}

export interface SsmlHoverParameterCopy {
  title: string;
  description: string;
}

export interface SsmlHoverTagCopy {
  title: string;
  description: string;
  parameters: Readonly<Record<string, SsmlHoverParameterCopy>>;
}

export interface SsmlHoverLocale {
  parameterHeading: string;
  parametersHeading: string;
  allowedValues: string;
  example: string;
  noParameters: string;
  tags: Readonly<Record<string, SsmlHoverTagCopy>>;
}

export const EDITOR_COPY: Readonly<Record<SsmlEditorLocale, EditorCopy>> = {
  ja: {
    editorAriaLabel: "SSMLエディター",
    toolbarAriaLabel: "SSMLツールバー",
    clearAll: "全てクリア",
    clearAllTitle: "音声設定を保持してXML要素を削除し本文を残す",
    undo: "元に戻す",
    undoTitle: "直前の変更を元に戻す",
    redo: "やり直す",
    redoTitle: "元に戻した変更をやり直す",
    help: "説明",
    helpTitle: "ボタンとパラメータの説明を表示",
    helpHeading: "ボタンとパラメータの説明",
    helpDescription: "各コントロールの機能とパラメータを確認できます。",
    parameters: "パラメータ",
    format: "フォーマット",
    formatTitle: "本文のXMLを改行して見やすく表示",
    decorations: "装飾",
    decorationsShowTitle: "インライン装飾を表示",
    decorationsHideTitle: "インライン装飾を非表示",
    syntaxError: "構文エラー",
    selectionActions: "選択範囲の操作",
    selectionCountSuffix: "文字",
    previewSelection: "選択部分を試聴",
    previewSelectionTitle: "選択部分のSSMLを試聴",
    noAvailableOptions: "利用可能な選択肢がありません。",
    categoryEmotions: "感情・トーン",
    categoryScenarios: "会話・シナリオ",
    categoryMedia: "メディア・ナレーション",
    categoryOther: "その他",
  },
  en: {
    editorAriaLabel: "SSML editor",
    toolbarAriaLabel: "SSML toolbar",
    clearAll: "Clear all",
    clearAllTitle: "Remove non-voice XML elements and keep the text and voice settings",
    undo: "Undo",
    undoTitle: "Undo the last change",
    redo: "Redo",
    redoTitle: "Redo the last undone change",
    help: "Help",
    helpTitle: "Show button and parameter descriptions",
    helpHeading: "Button and parameter descriptions",
    helpDescription: "Review what each control does and its parameters.",
    parameters: "Parameters",
    format: "Format",
    formatTitle: "Format the XML in the editor",
    decorations: "Decorations",
    decorationsShowTitle: "Show inline decorations",
    decorationsHideTitle: "Hide inline decorations",
    syntaxError: "Syntax error",
    selectionActions: "Selection actions",
    selectionCountSuffix: " characters",
    previewSelection: "Preview selection",
    previewSelectionTitle: "Preview the selected SSML",
    noAvailableOptions: "No options are available.",
    categoryEmotions: "Emotions / Tone",
    categoryScenarios: "Conversations / Scenarios",
    categoryMedia: "Media / Broadcast",
    categoryOther: "Other",
  },
};

export const INLINE_BADGE_COPY: Readonly<Record<SsmlEditorLocale, InlineBadgeCopy>> = {
  ja: {
    pause: "間",
    pitch: "ピッチ変化",
    prosody: "声の調整",
  },
  en: {
    pause: "Pause",
    pitch: "Pitch change",
    prosody: "Prosody",
  },
};

export const SSML_HOVER_COPY: Readonly<Record<SsmlEditorLocale, SsmlHoverLocale>> = {
  ja: {
    parameterHeading: "パラメータ",
    parametersHeading: "パラメータ",
    allowedValues: "使用できる値",
    example: "例",
    noParameters: "この要素にパラメータはありません。",
    tags: {
      voice: {
        title: "音声",
        description: "囲まれたテキストの合成に使用する音声と、任意の音声効果を選択します。",
        parameters: {
          name: { title: "name", description: "音声名。例: `en-US-JennyNeural`。" },
          effect: { title: "effect", description: "任意の音声効果。例: `eq_car`。" },
        },
      },
      prosody: {
        title: "韻律",
        description: "囲まれたテキストの速度、ピッチ、音量、またはピッチ曲線を変更します。",
        parameters: {
          rate: { title: "rate", description: "発話速度を指定します。" },
          pitch: { title: "pitch", description: "名前付きの値、割合、周波数、または半音でピッチを調整します。" },
          volume: { title: "volume", description: "名前付きの値、割合、またはデシベル値で音量を指定します。" },
          contour: { title: "contour", description: "テキスト内の位置ごとの相対的なピッチ変化を定義します。" },
          range: { title: "range", description: "音声のピッチ範囲を調整します。" },
        },
      },
      break: {
        title: "間",
        description: "単語やその他の音声コンテンツの間にポーズを挿入します。",
        parameters: {
          time: { title: "time", description: "ポーズの長さ。例: `500ms` または `1s`。" },
          strength: { title: "strength", description: "相対的なポーズの強さ。" },
        },
      },
      "mstts:express-as": {
        title: "表現",
        description: "囲まれたテキストに音声スタイル、スタイルの強さ、または役割を適用します。",
        parameters: {
          style: { title: "style", description: "選択した音声が対応する音声スタイル。例: `cheerful`。" },
          styledegree: { title: "styledegree", description: "選択した音声スタイルの強さを指定します。" },
          role: { title: "role", description: "対応している場合に音声の役割を変更します。" },
        },
      },
      "say-as": {
        title: "読み上げ方",
        description: "囲まれたテキストの解釈方法と読み上げ方を指定します。",
        parameters: {
          "interpret-as": { title: "interpret-as", description: "文字、数字、日付、時刻などの解釈を指定します。" },
          format: { title: "format", description: "選択した解釈の形式を補足します。" },
          detail: { title: "detail", description: "選択した解釈の詳細を補足します。" },
        },
      },
      phoneme: {
        title: "音素",
        description: "指定した音素表記で通常の発音を置き換えます。",
        parameters: {
          alphabet: { title: "alphabet", description: "`ph` 値に使用する音素アルファベット。" },
          ph: { title: "ph", description: "囲まれたテキストの音素表記。" },
        },
      },
      emphasis: {
        title: "強調",
        description: "囲まれたテキストを強調します。",
        parameters: {
          level: { title: "level", description: "強調の度合いを指定します。" },
        },
      },
      audio: {
        title: "音声ファイル",
        description: "合成結果の一部として音声ファイルを再生します。",
        parameters: {
          src: { title: "src", description: "音声ファイルの URI。" },
          desc: { title: "desc", description: "音声を再生できない場合に使用する代替テキスト。" },
          clipBegin: { title: "clipBegin", description: "音声ファイル内の開始位置。例: `0s`。" },
          clipEnd: { title: "clipEnd", description: "音声ファイル内の終了位置。例: `5s`。" },
          speed: { title: "speed", description: "音声ファイルの再生速度。例: `1.0`。" },
          repeatCount: { title: "repeatCount", description: "音声を繰り返す回数。例: `2`。" },
          repeatDuration: { title: "repeatDuration", description: "音声を繰り返す合計時間。例: `10s`。" },
          soundLevel: { title: "soundLevel", description: "デシベル単位の音量調整。例: `-3dB`。" },
        },
      },
      sub: {
        title: "置換",
        description: "囲まれたテキストの代わりに別名テキストを読み上げます。",
        parameters: {
          alias: { title: "alias", description: "元のテキストの代わりに読み上げるテキスト。例: `World Wide Web`。" },
        },
      },
      lang: {
        title: "言語",
        description: "囲まれたテキストの読み上げ言語を変更します。",
        parameters: {
          "xml:lang": { title: "xml:lang", description: "BCP-47 言語タグ。例: `ja-JP`。" },
        },
      },
      mark: {
        title: "マーカー",
        description: "合成音声ストリームにカスタムマーカーを挿入します。",
        parameters: {
          name: { title: "name", description: "アプリケーションで定義したマーカー名。例: `chapter-1`。" },
        },
      },
      bookmark: {
        title: "ブックマーク",
        description: "合成音声ストリームにブックマークマーカーを挿入します。",
        parameters: {
          mark: { title: "mark", description: "アプリケーションで定義したブックマーク名。例: `chapter-1`。" },
        },
      },
      lexicon: {
        title: "発音辞書",
        description: "合成文書に発音辞書を関連付けます。",
        parameters: {
          uri: { title: "uri", description: "発音辞書の URI。" },
        },
      },
      p: { title: "段落", description: "テキストを段落としてまとめます。", parameters: {} },
      s: { title: "文", description: "テキストを文としてまとめます。", parameters: {} },
      w: { title: "単語", description: "テキストを単語としてまとめます。", parameters: {} },
      "mstts:silence": {
        title: "無音",
        description: "テキストの前後、または句読点の境界に指定した無音を追加します。",
        parameters: {
          type: { title: "type", description: "無音の位置または句読点の境界。" },
          value: { title: "value", description: "無音の長さ。例: `300ms`。" },
        },
      },
      "mstts:viseme": {
        title: "ビゼーム",
        description: "合成音声のビゼームイベントを要求します。",
        parameters: {
          type: { title: "type", description: "ビゼームイベントの形式。" },
        },
      },
    },
  },
  en: {
    parameterHeading: "Parameter",
    parametersHeading: "Parameters",
    allowedValues: "Allowed values",
    example: "Example",
    noParameters: "This element has no parameters.",
    tags: {
      voice: {
        title: "Voice",
        description: "Selects the voice and optional voice effect used to synthesize the enclosed text.",
        parameters: {
          name: { title: "name", description: "The voice name, such as `en-US-JennyNeural`." },
          effect: { title: "effect", description: "An optional voice effect, such as `eq_car`." },
        },
      },
      prosody: {
        title: "Prosody",
        description: "Changes the speaking rate, pitch, volume, or pitch contour of the enclosed text.",
        parameters: {
          rate: { title: "rate", description: "Controls speaking speed." },
          pitch: {
            title: "pitch",
            description: "Adjusts pitch using a named value, percentage, frequency, or semitone value.",
          },
          volume: {
            title: "volume",
            description: "Controls loudness using a named value, percentage, or decibel value.",
          },
          contour: {
            title: "contour",
            description: "Defines a sequence of relative pitch changes at positions in the text.",
          },
          range: { title: "range", description: "Adjusts the pitch range of the voice." },
        },
      },
      break: {
        title: "Break",
        description: "Inserts a pause between words or other spoken content.",
        parameters: {
          time: { title: "time", description: "The pause duration, for example `500ms` or `1s`." },
          strength: { title: "strength", description: "The relative pause strength." },
        },
      },
      "mstts:express-as": {
        title: "Express-as",
        description: "Applies a speaking style, style degree, or role to the enclosed text.",
        parameters: {
          style: {
            title: "style",
            description: "The speaking style supported by the selected voice, such as `cheerful`.",
          },
          styledegree: { title: "styledegree", description: "Controls the intensity of the selected speaking style." },
          role: { title: "role", description: "Changes the speaking role when supported by the selected voice." },
        },
      },
      "say-as": {
        title: "Say-as",
        description: "Controls how the enclosed text is interpreted and spoken.",
        parameters: {
          "interpret-as": {
            title: "interpret-as",
            description: "Specifies the interpretation, such as characters, digits, date, or time.",
          },
          format: { title: "format", description: "Provides a format hint for the selected interpretation." },
          detail: {
            title: "detail",
            description: "Provides an additional detail hint for the selected interpretation.",
          },
        },
      },
      phoneme: {
        title: "Phoneme",
        description: "Replaces normal pronunciation with the supplied phonetic pronunciation.",
        parameters: {
          alphabet: { title: "alphabet", description: "The phonetic alphabet used by the `ph` value." },
          ph: { title: "ph", description: "The phonetic pronunciation for the enclosed text." },
        },
      },
      emphasis: {
        title: "Emphasis",
        description: "Adds emphasis to the enclosed text.",
        parameters: {
          level: { title: "level", description: "Controls the amount of emphasis." },
        },
      },
      audio: {
        title: "Audio",
        description: "Plays an audio file as part of the synthesized output.",
        parameters: {
          src: { title: "src", description: "The URI of the audio file." },
          desc: { title: "desc", description: "Alternative text to use if the audio cannot be played." },
          clipBegin: { title: "clipBegin", description: "The starting offset within the audio file." },
          clipEnd: { title: "clipEnd", description: "The ending offset within the audio file." },
          speed: { title: "speed", description: "The playback speed of the audio file." },
          repeatCount: { title: "repeatCount", description: "The number of times to repeat the audio." },
          repeatDuration: {
            title: "repeatDuration",
            description: "The total duration for which the audio may repeat.",
          },
          soundLevel: { title: "soundLevel", description: "The audio volume adjustment in decibels." },
        },
      },
      sub: {
        title: "Substitution",
        description: "Substitutes the alias text when speaking the enclosed text.",
        parameters: {
          alias: { title: "alias", description: "The text to speak instead of the enclosed text." },
        },
      },
      lang: {
        title: "Language",
        description: "Changes the language used for the enclosed text.",
        parameters: {
          "xml:lang": { title: "xml:lang", description: "The BCP-47 language tag." },
        },
      },
      mark: {
        title: "Mark",
        description: "Inserts a custom marker into the synthesized audio stream.",
        parameters: {
          name: { title: "name", description: "The application-defined marker name." },
        },
      },
      bookmark: {
        title: "Bookmark",
        description: "Inserts a bookmark marker into the synthesized audio stream.",
        parameters: {
          mark: { title: "mark", description: "The application-defined bookmark name." },
        },
      },
      lexicon: {
        title: "Lexicon",
        description: "Associates a pronunciation lexicon with the synthesized document.",
        parameters: {
          uri: { title: "uri", description: "The URI of the pronunciation lexicon." },
        },
      },
      p: { title: "Paragraph", description: "Groups text into a paragraph.", parameters: {} },
      s: { title: "Sentence", description: "Groups text into a sentence.", parameters: {} },
      w: { title: "Word", description: "Groups text into a word.", parameters: {} },
      "mstts:silence": {
        title: "Silence",
        description: "Adds a specified silence before or after text or at a punctuation boundary.",
        parameters: {
          type: { title: "type", description: "The silence position or punctuation boundary." },
          value: { title: "value", description: "The silence duration, for example `300ms`." },
        },
      },
      "mstts:viseme": {
        title: "Viseme",
        description: "Requests viseme events for the synthesized audio.",
        parameters: {
          type: { title: "type", description: "The viseme event format." },
        },
      },
    },
  },
};
