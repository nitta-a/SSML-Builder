# SSML-Builder

- [日本語](#日本語)
- [English](#english)

## 日本語

Azure Speech Service で利用できる SSML を、TypeScript のデータ構造から生成・解析し、React の GUI で編集するための npm ワークスペースモノレポです。公開成果物は `ssml-builder-js` という単一の npm パッケージです。

SSML の XML エスケープや Azure Speech 拡張要素に対応したコアライブラリ、Monaco Editor を利用した React コンポーネント、フレームワーク非依存の Web Component、Azure Text-to-Speech API クライアントをサブパスから提供します。

## パッケージ構成

| サブパス | 内容 |
| --- | --- |
| `ssml-builder-js` | コア機能と Azure Text-to-Speech クライアント |
| `ssml-builder-js/core` | SSML の型定義、ドキュメントの生成（`buildSsml`）、XML からの解析（`parseSsml`）、構文検証（`validateSsml`） |
| `ssml-builder-js/react` | ツールバーと本文の表示エリアを備えた `SsmlEditor` コンポーネント |
| `ssml-builder-js/elements` | React などに依存しない `<ssml-editor>` Web Component |

`ssml-builder-js` と `ssml-builder-js/core` は同じコア機能を提供します。React エディタは `ssml-builder-js/react` から読み込み、Azure TTS クライアントは `ssml-builder-js` から読み込みます。

## セットアップ

### npm パッケージとして利用する場合

公開済みのパッケージを利用するアプリケーションでは、パッケージをインストールします。

```sh
npm install ssml-builder-js
```

React エディタを使用する場合は、React と Monaco Editor のアダプターもインストールします。

```sh
npm install ssml-builder-js @monaco-editor/react react react-dom
```

ルートパッケージの React peer dependency は `>=18.2.0 <20` です。React 18.3.1 を使う Next.js の Pages Router / App Router アプリでは、この範囲に一致するため依存関係警告は発生しません。Monaco を使う `SsmlEditor` はクライアントコンポーネントとして配置してください。

Web Component を使用する場合は、Monaco Editor もインストールします。

```sh
npm install ssml-builder-js monaco-editor
```

Azure TTS クライアントも `ssml-builder-js` から利用できます。

### リポジトリを開発する場合

Node.js 22.6 以降をサポートします。Node.js 24 LTS 以降を推奨します（Node.js 22.6 未満は、現在の TypeScript 実行設定に必要な型消去機能を満たしません）。

```sh
npm ci
```

### Playground で音声を生成する

`apps/playground` の「音声を生成」ボタンは、現在の SSML をサーバー側の
Next.js Route Handler に送信し、`ssml-builder-js` で Azure
Speech の音声を生成します。Azure のサブスクリプションキーをブラウザへ公開しないため、
`apps/playground/.env.local` に次の値を設定してください。

```dotenv
AZURE_SPEECH_KEY=your-subscription-key
AZURE_SPEECH_REGION=japaneast
# AZURE_SPEECH_ENDPOINT=https://{region}.tts.speech.microsoft.com/tts/cognitiveservices/websocket/v1
```

`apps/playground/.env.example` をコピーして使用できます。設定後、リポジトリのルートから
次のコマンドで Playground を起動します。

```sh
cp apps/playground/.env.example apps/playground/.env.local
npm run dev --workspace playground
```

Playground の表示言語は `ja`、`en`、`ko`、`zh-Hans`、`fr`、`pt-BR`、`it`、`de`、
`ru` から選択できます。音声設定では `en-US`、`ja-JP`、`ko`、`zh-Hans`、`fr`、
`pt-BR`、`it`、`de`、`ru` の各言語について、女性・男性の音声を選択できます。
Playground の表示言語が日本語以外の場合、埋め込みエディターの UI は英語になります。
テーマは OS の設定に追従し、ライト・ダークを手動で切り替えて保存できます。現在の
SSML 全体または選択部分を Azure Speech で合成してブラウザーで再生でき、音声には
SSML 本文のキャプションが付きます。生成された SSML は画面下部に表示されます。

### Next.js で Monaco と選択範囲試聴を使う

Pages Router と App Router のどちらでも、Monaco を `next/dynamic` の `ssr: false` でクライアントへ分離します。`onPreviewSelection` から `/api/synthesize` Route Handler（Pages Router では同じ検証を `pages/api/synthesize.ts` に実装）へ部分 SSML を送り、Azure のキーはサーバー環境変数だけに置きます。リポジトリ内の `apps/playground/app/components/NextSsmlEditor.tsx` がこの構成の実装例です。

```tsx
"use client";
import dynamic from "next/dynamic";
const SsmlEditor = dynamic(
  () => import("ssml-builder-js/react").then(({ SsmlEditor }) => SsmlEditor),
  { ssr: false },
);

export function ClientEditor(props) {
  return <SsmlEditor {...props} onPreviewSelection={(ssml) =>
    fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssml }),
    })
  } />;
}
```

Route Handler/API Route では `validateSsml` と `validateAzureSsml` を実行してから Azure TTS を呼び出し、キーをクライアントへ渡さないでください。

## `ssml-core` の利用方法

`SsmlDocument` は `version`、`lang`、`children` を持つオブジェクトです。`children` には文字列、テキストノード、SSML 要素を入れられます。`children` を使う形式が推奨され、旧形式の `content` プロパティも `buildSsml` の入力として利用できます。

`lang` は読み上げ言語を表す BCP-47 タグで、パッケージ外部から `SsmlDocument` に設定します。`SsmlEditor` の `locale` は画面表示言語の設定であり、読み上げ言語とは別です。

```ts
import { buildSsml, parseSsml } from "ssml-builder-js/core";
import type { SsmlDocument } from "ssml-builder-js/core";

const document: SsmlDocument = {
  version: "1.0",
  lang: "ja-JP",
  children: [
    {
      type: "voice",
      name: "ja-JP-NanamiNeural",
      children: [
        {
          type: "prosody",
          rate: "medium",
          pitch: "+2st",
          children: ["こんにちは。"],
        },
        { type: "break", time: "300ms" },
        {
          type: "express-as",
          style: "cheerful",
          children: ["SSML Builder です。"],
        },
      ],
    },
  ],
};

// SsmlDocument から XML 文字列を生成します。
const ssml = buildSsml(document);

// XML 文字列を SsmlDocument に戻します。
const parsed = parseSsml(ssml);
```

`buildSsml` と `parseSsml` の主なシグネチャは次のとおりです。

| API | 用途 |
| --- | --- |
| `buildSsml(document)` | SSML ドキュメントを XML 文字列に変換 |
| `buildSsml(content, lang?)` | 本文から `SsmlDocument` を作成する簡易形式（`content` を使用する旧形式） |
| `buildPartialSsml(text, context?)` / `buildPartialSsml({ text, ...context })` | 言語、音声、プロソディなどのコンテキスト付きで部分テキストから最小の SSML を生成 |
| `parseSsml(xml)` | `<speak>` XML を `SsmlDocument` に変換 |
| `validateSsml(xml)` | SSML の構文エラーを `{ message, position }` または `null` で返す |
| `extractSsmlText(xml)` | タグを除いた全テキストノードを文書順に抽出 |
| `mapSsmlTextNodes(xml, transform, options?)` | タグ構造を維持したままテキストノードだけを同期・非同期変換。スキップタグとコンテキストフィルターに対応 |
| `extractSsmlTranslatableText(xml, options?)` | `phoneme`、`say-as`、`sub` などを除外した翻訳対象本文を文書順に抽出 |
| `fromPlainTextToSsml(text, options?)` | プレーンテキストを `<speak>`、段落 `<p>`、文 `<s>` を含む SSML に変換 |
| `validateSsmlStructureIntegrity(original, translated)` | 翻訳前後のタグ階層・タグ名・属性の一致を検証 |
| `validateAzureSsml(xml, options?)` | Azure Speech 向けの意味検証結果を Diagnostic 配列で返す（各診断に `source: "ssml-static-validator"` を付与） |
| `getAzureVoiceCatalogMetadata()` / `getBuiltInVoiceCatalogMetadata()` | 組み込み音声カタログの生成日時、API バージョン、リージョン、収録数、有効期限、リージョン差分を返す |

### 3段階の検証モデル

SSML の検証は、構文、Azure 固有の静的な意味、実サービスのランタイム状態を分けて扱います。前段の検証に通っても、後段の検証結果までは保証しません。

| 段階 | API / 操作 | 検証する範囲 | 検証しない範囲 |
| --- | --- | --- | --- |
| XML 構文 | `validateSsml` | XML の整形式性、タグの対応、属性・エンティティの構文 | Azure の音声・属性・スタイル対応、アカウント状態、実際の合成可否 |
| 静的意味 | `validateAzureSsml` | Azure SSML の必須要素、属性値、音声と `xml:lang` の整合性、音声スタイル、文字数、`audio` URL/オリジン | Azure 側の最新音声一覧、キー・リージョン権限、サービス障害、実際の音声生成結果 |
| ランタイム | `AzureTtsClient.synthesize` / Azure Speech API | アカウント、リージョン、キー、最新の音声・スタイル提供状況、サービス側の SSML 制約、通信状態 | 静的検証の代替ではないため、入力検証や SSRF 対策を自動で補完しない |

`voice`、`prosody`、`break`、`express-as`、`say-as`、`phoneme`、`audio`、`lang`、`mark` に加えて、`mstts:dialog`、`mstts:turn`、`mstts:backgroundaudio`、`mstts:ttsembedding`、`mstts:embedding`、`mstts:voiceconversion` を型付きで表現できます。`type: "custom"` と `name` を指定すれば、未定義の XML 要素や追加属性も扱えます。`mstts:` 要素を含むドキュメントを生成すると、必要な Azure Speech 名前空間が自動的に追加されます。

`mstts:turn` は `voice` またはマルチトーカー用の `speaker` を指定でき、`mstts:ttsembedding` は `speakerProfileId`、`mstts:embedding` は `id`、`mstts:voiceconversion` は `url` と `profile` を専用プロパティで指定できます。`mstts:backgroundaudio` は `<speak>` 直下の先頭要素として 1 文書に 1 つだけ配置し、`fadein`/`fadeout` は単位なしの生ミリ秒（0〜10000）で指定します。

`validateAzureSsml` は Azure Speech へ送信する前に実行する事前静的チェックです。返却される診断の `source` はパッケージ側の静的解析結果であることを示し、Azure Speech サービス側でのランタイム生成結果や実際の合成可否を表すものではありません。

翻訳などで本文だけを置き換える場合は、`mapSsmlTextNodes` に変換関数を渡します。変換関数には直近の親タグと祖先タグの `path` が渡され、戻り値は `string` または `Promise<string>` を指定できます。`validateAzureSsml` は音声、属性値、音声スタイル、文字数、`audio` URL/オリジンを検証します。

`mstts:audioduration` は `<mstts:audioduration value="10s"/>` の形式で扱えます。`value` には正の `ms`／`s` 値、または `hh:mm:ss`（ミリ秒を含む場合は `hh:mm:ss.fff`）を指定できます。

`mapSsmlTextNodes` の第 3 引数で、翻訳対象外タグとコンテキストフィルターを指定できます。デフォルトでは `phoneme`、`say-as`、`sub` の本文を変換しません。`filter` には `parentTag`、`parentAttributes`、`ancestorTags`、`path` が渡されます。

移行処理では `extractSsmlTranslatableText` で翻訳対象だけを抽出し、`validateSsmlStructureIntegrity` で翻訳後にタグ階層と属性が変わっていないことを確認できます。新しい原稿は `fromPlainTextToSsml` で `<p>` と `<s>` を含む初期文書へ変換できます。

```ts
const translated = await mapSsmlTextNodes(ssml, translate, {
  skipTags: ["phoneme", "say-as", "sub", "custom-no-translate"],
  filter: ({ parentAttributes, ancestorTags }) =>
    ancestorTags.includes("voice") && parentAttributes["xml:lang"] !== "ja-JP",
});
```

`validateAzureSsml` は `AzureValidationOptions` で音声・スタイルの定義を追加できます。言語比較は `Intl.Locale` を使って BCP 47 として正規化し、組み込みで `zh-Hans` と `zh-CN`、`zh-Hant` と `zh-TW` を同一視します。独自の別名や正規化関数も注入できます。

```ts
const diagnostics = validateAzureSsml(ssml, {
  languageAliases: { "ja": ["ja-JP", "ja-Japan"] },
  normalizeLanguage: (language) => language.replace("_", "-"),
});
```

音声カタログは `AzureVoiceDefinition` の `name`、`locale`、`secondaryLocales`、`styles`、`supportedTags`、`unsupportedTags`、`models`、`regions`、`status` で表現できます。`voiceDefinitions`（または `voiceCatalog`）を渡すと、組み込み台帳を外部定義で補完・上書きできます。`supportedTags`／`unsupportedTags` による音声別制約違反は `azure-unsupported-tag-for-voice` としてエラーになります。組み込み台帳にない音声は `azure-unknown-voice`（`unknownVoicePolicy` に従う）、登録済み音声への非対応スタイルは `azure-unsupported-style`、ロケール不一致は `azure-locale-mismatch` として区別されます。

`npm run sync:voices -- --regions eastus,japaneast` は Azure List Voices API をリージョンごとに取得し、重複を除いた TypeScript 音声定義と `azureVoiceCatalog.json`（生成日時、API バージョン、リージョン、収録数）を更新します。認証情報は `AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION(S)`、または CLI オプションで指定します。

```ts
const diagnostics = validateAzureSsml(ssml, {
  voiceDefinitions: [
    {
      name: "my-custom-voice",
      locale: "ja-JP",
      secondaryLocales: ["zh-Hant"],
      styles: ["narration"],
    },
  ],
  unknownVoicePolicy: "error", // "error" | "warn" | "ignore"
  allowedAudioOrigins: ["https://cdn.example.com"],
});
```

Azure の音声・スタイル一覧はサービス更新やリージョン差分があるため、組み込み一覧は固定の完全な台帳ではありません。新しい音声を完全に静的検証したい場合は、音声名だけでなくロケールとスタイルを `voiceDefinitions` に定義してください。`validateNestedVoices` のデフォルトは `true` です。`audio` の外部 URL はデフォルトで拒否されるため、利用する場合は `allowedAudioOrigins` に許可するオリジンを列挙するか、構成を理解した上で `allowExternalAudio: true` を指定してください。

Azure の音声カタログを更新する場合は、`AZURE_SPEECH_REGION` と `AZURE_SPEECH_KEY` を設定して `npm run sync:voices` を実行します。`packages/ssml-core` の音声定義とエディタのスタイル補完候補が同時に更新されます。

```ts
const diagnostics = validateAzureSsml(ssml, {
  customVoiceStyleMap: { "my-custom-voice": ["narration"] },
  unknownVoicePolicy: "error", // "error" | "warn" | "ignore"
  allowedAudioOrigins: ["https://cdn.example.com"],
  maxXmlDepth: 24,
});
```

`audio`、`mstts:backgroundaudio`、`lexicon`、`mstts:voiceconversion` の URL は `urlValidator`（または `customUrlValidator`）へ渡せます。コールバックは `(url, context, signal)` を受け取り、Promise を返す検証関数で DNS 解決後のプライベート IP 遮断などを実装できます。検証キャッシュはタグ・属性・URL ごとに分離されます。

`maxXmlDepth` は `<speak>` を深さ 1 として XML の過剰なネストを検出します。長文は `splitSsmlDocument` で `<p>`／`<s>` と親の `voice`、`prosody` コンテキストを保ったまま分割できます。

```ts
import { splitSsmlDocument } from "ssml-builder-js/core";

const blocks = splitSsmlDocument(longSsml, 10_000);
for (const block of blocks) {
  // 各 block は独立した <speak> 文書として Azure へ送信できます。
  await client.synthesize(block.ssml);
}
```

各ブロックは `SsmlChunk`（`chunkIndex`、`originalTextRange`、継承した音声/言語/韻律、内包マーク、背景音声の有無）です。`<mstts:backgroundaudio>` はデフォルトで先頭チャンクだけに含まれ、全チャンクへ複製する場合は `splitSsmlDocument(longSsml, 10_000, { replicateBackgroundAudio: true })` を指定します。

Azure Speech は `<audio>` の URL を取得するため、任意の URL をそのまま受け付けるサーバーは SSRF の踏み台になり得ます。ユーザー入力の SSML を合成する場合は、HTTPS、許可オリジン、リダイレクト先、応答サイズをサーバー側でも制限し、`allowExternalAudio` だけで無制限に許可しないでください。

## `ssml-editor-react` の利用方法

`SsmlEditor` は `SsmlDocument` を受け取り、ツールバーと本文の表示エリアだけを表示するシンプルなコンポーネントです。ツールバーから選択範囲の速度、音量、ピッチなどの設定、元に戻す・やり直す操作ができます。音声の選択と表示はアプリ側で行います。本文の編集には Monaco Editor を使用し、変更時に SSML の構文を検証します。構文エラーはエディター上のマーカーとエラーメッセージで表示されます。XML のタグ名やパラメータへホバーすると SSML の説明を確認できます。テキストを選択すると、選択文字数と試聴を行うフローティングアクションが表示されます。`enableCodeLens`（デフォルトは `true`）が有効な場合、`prosody`、`break`、`mstts:audioduration` タグの上に属性編集やタグ操作の CodeLens が表示されます。`showDecorations` が有効な場合、`break` と `prosody` のタグに間やピッチ変化を示すインラインバッジが表示され、Monaco のインライン装飾も有効になります。生成された SSML は `onSsmlChange` で受け取り、アプリ側で自由に表示できます。`SsmlEditorRef` を `ref` に渡すと、全体、選択範囲、または現在行の SSML を取得できます。画面表示は日本語（デフォルト）と英語に対応しています。

`editMode="visual"` を指定するかツールバーの **Visual** を選ぶと、XML を直接見ずに構造ツリーとパンくずから親要素を選択し、フォームで本文の変更、rate、pitch、emotion、pause、pronunciation の適用ができます。Azure の配置違反や属性エラーはビジュアル領域にも表示されます。`editMode="code"` で Monaco に戻ります。

Visual Editor と Code Editor の対応要素は次のとおりです。

| 要素 | Visual Editor | Code Editor |
| --- | --- | --- |
| `voice`、`prosody` | 音声名/effect、rate/pitch/volume/contour/range のフォーム | 完全対応 |
| `say-as`、`phoneme` | 属性フォーム・構造ツリー | 完全対応 |
| `audio` | URL、説明、clip、速度、繰り返し、音量のフォーム | 完全対応 |
| `mark`、`bookmark` | 名前のフォーム | 完全対応 |
| `mstts:silence`、`mstts:audioduration` | 種別/value・duration のフォーム | 完全対応 |
| `mstts:dialog` / `mstts:turn` | 話者ターンの追加・音声/話者/本文編集 | 完全対応・補完あり |
| `mstts:backgroundaudio` | URL、音量、フェードイン/アウト編集 | 完全対応・補完あり |
| `mstts:ttsembedding`、`mstts:embedding`、`mstts:voiceconversion` | profile/id/url のフォーム | 完全対応 |
| 未定義の XML 要素 | 構造ツリーで保持 | `custom` として編集 |

Azure Speech のライフサイクル対応状況は次のとおりです。GA 要素は通常の静的検証対象、プレビュー要素・音声は Warning、非推奨要素・音声は Info の診断を返します。`AzureVoiceDefinition.status` と `AzureValidationOptions.tagStatuses` で外部カタログの状態も指定できます。

| 状態 | 診断 | 対象 |
| --- | --- | --- |
| GA | なし | 標準 SSML、`mstts:dialog`、`mstts:backgroundaudio` |
| Preview | Warning | `mstts:voiceconversion`、`previewTags` / `tagStatuses` に指定した要素、`status: "preview"` の音声 |
| Deprecated | Info | `deprecatedTags` / `tagStatuses`、`status: "deprecated"` の音声 |

`<mstts:express-as>` の `style` 属性補完と標準の感情メニューは、カーソルまたは選択範囲を囲む最内の `<voice name="...">` が対応するスタイルだけを表示します。音声名が未指定の場合は全候補を表示し、登録済みでスタイル非対応の音声や未登録の音声では候補がないことを表示します。`emotionStyles` を指定した場合、感情メニューではその値と登録済み音声の対応スタイルの共通部分を使用します。

```tsx
import { useState } from "react";
import { SsmlEditor } from "ssml-builder-js/react";
import type { SsmlDocument } from "ssml-builder-js/core";

const initialDocument: SsmlDocument = {
  version: "1.0",
  lang: "ja-JP",
  children: ["編集する本文"],
};

export function App() {
  const [document, setDocument] = useState(initialDocument);
  const [ssml, setSsml] = useState("");

  return (
    <>
      <SsmlEditor
        document={document}
        onChange={setDocument}
        onSsmlChange={setSsml}
        locale="ja"
      />
      <pre>{ssml}</pre>
    </>
  );
}
```

- `document`: 編集対象の `SsmlDocument`
- `onChange`: 編集後の `SsmlDocument` を受け取るコールバック
- `onSsmlChange`: 編集後に生成された SSML 文字列を受け取るコールバック
- `ref`: `SsmlEditorRef` の `getFullSsml()` で全体の SSML、`getSelectedSsml()` で選択範囲（未選択時は内容が空でないカーソル行）の SSML、`getCurrentLineSsml()` で現在行の SSML を取得。選択範囲やカーソル行が空の場合は `null` を返します
- `onSelectionChange`: 選択テキスト、文字数、選択状態を受け取るコールバック
- `onPreviewSelection`: フローティングアクションの試聴ボタン押下時に、選択部分を元の `speak` 属性、`voice`、`prosody` などの親コンテキストで包んだ一時 SSML を受け取るコールバック。省略時は試聴ボタンが無効になります。Azure などの音声 API はこのコールバックから呼び出してください
- `editMode`: 初期編集モード（`"code"` または `"visual"`）。Visual モードは構造ツリーとフォームによる構造化編集を提供します
- `locale`: 画面表示の言語（`"ja"` または `"en"`）。省略時は `"ja"`。ホバーヘルプを含む UI の翻訳にも使用されます
- `language`: `locale` の旧名称。既存コードとの互換性のため利用できますが、新しいコードでは `locale` を使用してください
- `showToolbar`: ツールバー領域を表示するかどうか（デフォルトは `true`）
- `showToolbarIcons`: ツールバーのアイコン表示（デフォルトは `true`）
- `showToolbarLabels`: ツールバーの文字による説明表示（デフォルトは `false`）。省略時はアイコンにホバーすると説明が表示されます
- `showDecorations`: 本文中のインライン装飾（バッジや Inlay Hints）の表示（デフォルトは `false`）。ツールバーの「装飾」スイッチで表示・非表示を切り替えられます
- `enableCodeLens`: `prosody`、`break`、`mstts:audioduration` タグの CodeLens クイックコントローラーを表示するか（デフォルトは `true`）
- `buttonVisibility`: ツールバーボタンごとの表示設定。`help`、`break`、`emphasis`、`rate`、`pitch`、`volume`、`emotion`、`say-as`、`lang`、`mstts:silence`、`mstts:audioduration`、`undo`、`redo`、`clearAll`、`format`、`decorations`、カスタム挿入 ID を指定でき、未指定のボタンは表示されます
- `editorOptions` / `settings`: Monaco の設定。`height`、`minHeight`、`readOnly`、`theme`（`system` / `light` / `dark`）、`fontSize`、`wordWrap`、`lineNumbers`、`minimap`、`automaticLayout` を指定できます。これらは同名のトップレベル props でも指定できます
- `loadingFallback`: Monaco の読み込み中に表示する React ノード
- `toolbarOrder`: ツールバー全体のボタン ID の表示順。指定されていないボタンは後ろに続きます
- `toolbarGroups`: ツールバー全体を縦線で区切るグループ設定。`{ id, buttonIds }` 形式で指定し、枠線付きのグループは使用しません
- `insertionOrder`: 挿入メニューの ID の表示順。`toolbarOrder` が未指定の場合の挿入メニュー順にも使用されます
- `insertionGroups`: 挿入メニューを縦線で区切るグループ設定。`toolbarGroups` を省略した場合は、この設定からツールバーの既定グループも作成されます。省略時は間・無音、声の調整、表現、読み上げに分けて表示されます
- `emotionStyles`: `emotion` メニューに表示する音声スタイル候補
- `customInsertions` / `additionalInsertions`: カスタム SSML 挿入定義。`customInsertions` は同じ ID の標準定義を置き換え、`additionalInsertions` は標準定義へ追加します
- `customInspectors`: Visual Editor のタグ名ごとに Inspector を差し替えるレンダラー
- `renderVoiceSelector`: 音声セレクターのカスタムレンダラー。`voiceCatalog` と `voiceLocale`、`voiceRegion`、`voiceStyle` で候補を絞り込めます。プレビュー音声にはバッジ情報も渡されます
- `voiceModel`（または `model`）: 選択中の Azure 音声モデル。音声カタログの対応モデル、SSML タグ、スタイル、ロケールとの不整合を Visual Editor にリアルタイム表示します
- `className` / `style`: エディター全体のクラス名とインラインスタイル
- `toolbarClassName` / `toolbarStyle`: ツールバーのクラス名とインラインスタイル
- `displayClassName` / `displayStyle`: 本文表示エリアのクラス名とインラインスタイル
- ツールバーの「フォーマット」ボタンで本文の XML を整形できます
- 挿入専用の要素（`break`、`mstts:silence`、`mstts:audioduration`、カスタム挿入の `mode: "insert"`）は、本文内で独立した行になるよう自動的に改行されます。選択範囲を囲む要素はインラインのまま挿入されます
- 本文を変更すると SSML 構文を検証し、エラー箇所をエディター上に表示します

標準の挿入メニューには `break`、`emphasis`、`rate`、`pitch`、`volume`、`emotion`、`say-as`、`lang`、`mstts:silence`、`mstts:audioduration` が含まれます。これらの定義は `SSML_INSERTIONS` から参照できます。カスタム挿入定義は配列または ID をキーにしたオブジェクトで指定でき、`createSsmlEditorInsertionDefinition` でタグ名と任意の 1 属性を持つ定義を作成できます。任意の属性や複数属性が必要な場合は `SsmlEditorInsertionDefinition` の `createTemplate` を実装してください。

「説明」ボタンを押すと、各コントロール、ボタン、設定の説明を表示できます。ボタンの設定はアコーディオンで表示され、デフォルトでは閉じています。アコーディオンのタイトルにはボタンの説明と生成される XML のタグ名が表示され、各設定の意味を確認できます。「全てクリア」ボタンは `voice` 要素を保持したまま、それ以外の XML 要素を削除して本文を残します。ドキュメントの `version`、`lang`、その他の属性も保持されます。

## `ssml-editor-elements` の利用方法

`ssml-builder-js/elements` は、React などに依存しない `<ssml-editor>` Web Component を登録します。`monaco-editor` を別途インストールし、`value`、`theme`、`readonly` 属性または同名プロパティを使用できます。React エディターと同じ SSML ツールバーと説明表示も利用でき、`locale`、`show-toolbar`、`show-toolbar-labels`、`show-decorations` で表示を調整できます。`edit-mode="visual"` または `editor.editMode = "visual"` で構造ツリーとフォームのビジュアル編集に切り替えられます。編集時には `{ value }` を `detail` に持つ `change` イベントが発生し、ビジュアルモードの試聴は `{ ssml }` を持つ `preview-selection` イベントで受け取れます。

```ts
import "ssml-builder-js/elements";
import type { SsmlEditorElement } from "ssml-builder-js/elements";

const editor = document.querySelector("ssml-editor") as SsmlEditorElement | null;
if (editor) {
  editor.value = '<speak version="1.0">編集する本文</speak>';
  editor.theme = "vs-dark";
  editor.locale = "ja";
  editor.addEventListener("change", (event) => {
    console.log((event as CustomEvent<{ value: string }>).detail.value);
  });
}
```

## `azure-tts-client` の利用方法

`AzureTtsClient` に Azure Speech のサブスクリプションキーとリージョンを渡し、`synthesize` に SSML を渡します。戻り値は音声データの `ArrayBuffer` です。

```ts
import { AzureTtsClient } from "ssml-builder-js";

const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});

const audio = await client.synthesize(ssml);
// audio は audio/mpeg の ArrayBuffer
```

帯域幅を抑える場合は `audio-24khz-48kbitrate-mono-mp3` または `audio-16khz-32kbitrate-mono-mp3` を指定できます。

最新の音声一覧は公開 API から取得できます。複数リージョンを指定した場合は音声名で重複排除され、各音声の `regions` と `metadata`（`voiceCount`、`generatedAt`、`apiVersion`、`regions`）が返ります。

```ts
import { fetchAzureVoiceCatalog } from "ssml-builder-js";

const catalog = await fetchAzureVoiceCatalog({
  apiKey: process.env.AZURE_SPEECH_KEY!,
  region: ["eastus", "japaneast"],
});
```

CLI では `npx ssml-builder sync-voices --region eastus --output ./azure-voices.json` を実行します。キーは `AZURE_SPEECH_KEY`（または `--key`）、リージョンは `AZURE_SPEECH_REGION(S)`（または `--region(s)`）から指定できます。

```ts
const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: process.env.AZURE_SPEECH_REGION!,
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  timeoutMs: 15_000,
});
```

低レベルの `synthesizeSpeech` 関数も利用できます。この関数では `TtsConfig` の
`endpoint`、`subscriptionKey`、`region` を指定します。

```ts
import { synthesizeSpeech } from "ssml-builder-js";

const audio = await synthesizeSpeech(ssml, {
  endpoint: "https://japaneast.tts.speech.microsoft.com/tts/cognitiveservices/websocket/v1",
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});
```

内部では Microsoft Cognitive Services Speech SDK の `SpeechSynthesizer` を使用します。`AzureTtsClient` の `endpoint` を省略すると `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` が使用されます。上の Playground の例では `.env.example` に合わせて WebSocket エンドポイントを明示しています。独自エンドポイントに `{region}` を含めた場合は、設定したリージョンに置き換えられます。
`endpoint` に空文字または空白文字列を指定した場合も、リージョンの既定エンドポイントへフォールバックします。`logger` オプションには `debug`、`info`、`warn`、`error` を持つロガーを注入できます。省略時はクライアントからログを出力しません。
`outputFormat` には Speech SDK がサポートする出力形式を指定できます。省略時は `audio-16khz-128kbitrate-mono-mp3` が使用されます。
`timeoutMs` は合成を打ち切る時間（ミリ秒）、`signal` はクライアント切断などによるキャンセル用の `AbortSignal` です。リトライする場合は、タイムアウトや一時的な SDK エラーだけを対象にし、同じ `AbortSignal` を渡して指数バックオフを使用してください。

Next.js Route Handler ではキーをブラウザへ渡さず、サーバー側で検証・合成します。

```ts
// app/api/synthesize/route.ts
import { AzureTtsClient, AzureTtsError } from "ssml-builder-js";
import { validateAzureSsml, validateSsml } from "ssml-builder-js/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { ssml?: unknown };
  if (typeof body.ssml !== "string" || validateSsml(body.ssml))
    return Response.json({ error: "Invalid SSML" }, { status: 400 });
  if (validateAzureSsml(body.ssml).some(({ severity }) => severity === "error"))
    return Response.json({ error: "Invalid Azure SSML" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const audio = await new AzureTtsClient({
      subscriptionKey: process.env.AZURE_SPEECH_KEY!,
      region: process.env.AZURE_SPEECH_REGION!,
      signal: controller.signal,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    }).synthesize(body.ssml);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
  } catch (error) {
    const status = error instanceof AzureTtsError && error.status === 0 ? 504 : 502;
    return Response.json({ error: "Speech synthesis failed" }, { status });
  } finally {
    clearTimeout(timeout);
  }
}
```

リトライを追加する場合は、`AzureTtsSdkError` の内容をログへ出しすぎず、SSML 本文とサブスクリプションキーをログへ書かないでください。外部 `audio` を使う場合も、上記の許可オリジン検証を合成前に実施してください。

Speech SDK の合成エラーでは `AzureTtsSdkError`（`AzureTtsError` のサブクラス）がスローされ、`errorDetails` から SDK のエラー詳細を確認できます。SDK が HTTP ステータスやリクエスト ID を公開しないため、SDK 経由のエラーでは `status` は `0`、`statusText` は `"Speech SDK"`、`requestId` は `null` です。Playground のサーバー側ログにもこれらの情報とリージョン、SSML の文字数が出力されます。ログに出力するエラー詳細は 4,096 文字までに制限されます。サブスクリプションキーや SSML 本文自体はログに出力されません。

サブスクリプションキーはリクエストヘッダーに含まれるため、ソースコードへハードコードしたりログへ出力したりしないでください。ブラウザから直接呼び出す場合はキーが利用者へ公開されるため、通常はサーバー側で Azure TTS を呼び出す構成にします。

## 仕様と参照元

このプロジェクトは Azure Speech における SSML の実装を主な対象としています。Azure Speech の SSML 実装は W3C の SSML Version 1.0 をベースにしていますが、対応要素や動作は W3C 標準と異なる場合があり、Azure 固有の `mstts:` 拡張も含まれます。

- [Azure Speech SSML のドキュメント構造とイベント（Microsoft Learn）](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-structure)
- [Azure Speech SSML リファレンス（Microsoft Learn）](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup)
- [Speech Synthesis Markup Language (SSML) Version 1.0（W3C Recommendation）](https://www.w3.org/TR/2004/REC-speech-synthesis-20040907/)
- 参照バージョン: **W3C SSML 1.0**（2004 年 9 月 7 日勧告）。Microsoft Learn の Azure Speech ドキュメントには固定された製品バージョン番号がないため、利用時は上記リンク先の最新の仕様も確認してください。

## 開発用コマンド

リポジトリのルートで次のコマンドを実行できます。

| コマンド | 内容 |
| --- | --- |
| `npm run format` | Biome によるフォーマットチェック |
| `npm run format:write` | Biome によるフォーマット適用 |
| `npm run lint` | Biome による静的チェック |
| `npm run check` | `format` と lint をまとめた Biome チェック |
| `npm run typecheck` | 全ワークスペースの TypeScript 型チェック |
| `npm run build` | 各パッケージのビルド |
| `npm test` | 各パッケージのテスト |

CI と同じ確認をまとめて行う場合は、次のコマンドを使用します。

```sh
npm run format
npm run lint
npm run typecheck
npm run build
npm test
```

`dist/` と `packages/*/dist` はビルド時に生成されるファイルのため、直接編集したりコミットしたりしないでください。

## English

SSML-Builder is an npm workspace monorepo for generating and parsing SSML supported by Azure Speech Service from TypeScript data structures and editing it in a React GUI. Its published output is a single npm package, `ssml-builder-js`.

It provides a core library with XML escaping and Azure Speech extension support, a React component based on Monaco Editor, a framework-independent Web Component, and an Azure Text-to-Speech API client through package subpaths.

## Package structure

| Subpath | Description |
| --- | --- |
| `ssml-builder-js` | Core functionality and the Azure Text-to-Speech client |
| `ssml-builder-js/core` | SSML type definitions, document generation (`buildSsml`), XML parsing (`parseSsml`), and syntax validation (`validateSsml`) |
| `ssml-builder-js/react` | The `SsmlEditor` component with a toolbar and text display area |
| `ssml-builder-js/elements` | The framework-independent `<ssml-editor>` Web Component |

`ssml-builder-js` and `ssml-builder-js/core` provide the same core functionality. Import the React editor from `ssml-builder-js/react`; the Azure TTS client is available from `ssml-builder-js`.

## Setup

### Using the npm packages

Install the package required by your application:

```sh
npm install ssml-builder-js
```

To use the React editor, also install React and the Monaco Editor adapter:

```sh
npm install ssml-builder-js @monaco-editor/react react react-dom
```

The root package accepts React `>=18.2.0 <20` as a peer dependency. Next.js applications using React 18.3.1 work with both the Pages Router and App Router without a peer-dependency range warning. Place the Monaco-based `SsmlEditor` in a client component.

To use the Web Component, also install Monaco Editor:

```sh
npm install ssml-builder-js monaco-editor
```

The Azure TTS client is also available from `ssml-builder-js`.

### Developing this repository

Node.js 22.6 or later is supported; Node.js 24 LTS or later is recommended. Versions below Node.js 22.6 do not provide the type-stripping capability required by the current TypeScript execution configuration:

```sh
npm ci
```

### Generating audio in the playground

The **Generate audio** button in `apps/playground` sends the current SSML to a
server-side Next.js Route Handler, which uses `ssml-builder-js` to
generate speech with Azure Speech. To keep the Azure subscription key out of the
browser, set the following values in `apps/playground/.env.local`:

```dotenv
AZURE_SPEECH_KEY=your-subscription-key
AZURE_SPEECH_REGION=japaneast
# AZURE_SPEECH_ENDPOINT=https://{region}.tts.speech.microsoft.com/tts/cognitiveservices/websocket/v1
```

Copy `apps/playground/.env.example` to get started. Then run the playground from the repository root:

```sh
cp apps/playground/.env.example apps/playground/.env.local
npm run dev --workspace playground
```

The playground UI can be displayed in `ja`, `en`, `ko`, `zh-Hans`, `fr`, `pt-BR`, `it`,
`de`, or `ru`. Speech settings provide female and male voices for `en-US`, `ja-JP`,
`ko`, `zh-Hans`, `fr`, `pt-BR`, `it`, `de`, and `ru`. The embedded editor supports
Japanese and English UI, so non-Japanese playground locales use the English editor UI.
The theme follows the operating system preference until a light or dark mode is selected
manually, and the manual choice is stored in the browser. You can synthesize the full
SSML document or the selected text and play it in the browser with an SSML caption track;
the generated SSML is shown below the editor.

### Using Monaco and selection preview with Next.js

For both the Pages Router and App Router, keep Monaco in a client-only module with `next/dynamic` and `{ ssr: false }`. Send the partial SSML from `onPreviewSelection` to the `/api/synthesize` Route Handler (or the equivalent `pages/api/synthesize.ts` API Route), and keep the Azure key in server-only environment variables. The repository example is `apps/playground/app/components/NextSsmlEditor.tsx`.

```tsx
"use client";
import dynamic from "next/dynamic";
const SsmlEditor = dynamic(
  () => import("ssml-builder-js/react").then(({ SsmlEditor }) => SsmlEditor),
  { ssr: false },
);

export function ClientEditor(props) {
  return <SsmlEditor {...props} onPreviewSelection={(ssml) =>
    fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssml }),
    })
  } />;
}
```

The Route Handler/API Route must run `validateSsml` and `validateAzureSsml` before calling Azure TTS. Never send the subscription key to the browser.

## Using `ssml-core`

`SsmlDocument` is an object with `version`, `lang`, and `children` properties. `children` can contain strings, text nodes, and SSML elements. The `children` form is recommended; the legacy `content` property is also accepted as input by `buildSsml`.

`lang` is the BCP-47 tag for speech synthesis and is set on `SsmlDocument` by the package consumer. `SsmlEditor`'s `locale` prop controls the UI language and is separate from the speech language.

```ts
import { buildSsml, parseSsml } from "ssml-builder-js/core";
import type { SsmlDocument } from "ssml-builder-js/core";

const document: SsmlDocument = {
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
          pitch: "+2st",
          children: ["Hello."],
        },
        { type: "break", time: "300ms" },
        {
          type: "express-as",
          style: "cheerful",
          children: ["This is SSML Builder."],
        },
      ],
    },
  ],
};

// Generate an XML string from an SsmlDocument.
const ssml = buildSsml(document);

// Parse an XML string back into an SsmlDocument.
const parsed = parseSsml(ssml);
```

The main `buildSsml` and `parseSsml` signatures are:

| API | Description |
| --- | --- |
| `buildSsml(document)` | Converts an SSML document into an XML string |
| `buildSsml(content, lang?)` | Convenience form that creates an `SsmlDocument` from text (legacy `content` form) |
| `buildPartialSsml(text, context?)` / `buildPartialSsml({ text, ...context })` | Builds minimal playable SSML for partial text with language, voice, and prosody context |
| `parseSsml(xml)` | Converts a `<speak>` XML document into an `SsmlDocument` |
| `validateSsml(xml)` | Returns `{ message, position }` for a syntax error, or `null` |
| `extractSsmlText(xml)` | Extracts all text nodes in document order |
| `mapSsmlTextNodes(xml, transform, options?)` | Transforms only text nodes while preserving the XML structure; supports sync/async transforms, skipped tags, and context filters |
| `extractSsmlTranslatableText(xml, options?)` | Extracts translation-target text in document order while skipping `phoneme`, `say-as`, `sub`, and other configured tags |
| `fromPlainTextToSsml(text, options?)` | Converts plain text into an initial `<speak>` document containing paragraphs (`<p>`) and sentences (`<s>`) |
| `validateSsmlStructureIntegrity(original, translated)` | Checks that tag hierarchy, element names, and attributes are unchanged after translation |
| `validateAzureSsml(xml, options?)` | Returns Azure Speech semantic-validation diagnostics (each diagnostic has `source: "ssml-static-validator"`) |
| `getAzureVoiceCatalogMetadata()` / `getBuiltInVoiceCatalogMetadata()` | Returns generation time, API version, regions, voice count, expiry, and known regional differences for the bundled voice catalog |

### Three-stage validation model

SSML validation separates XML syntax, Azure-specific static semantics, and runtime service state. Passing an earlier stage does not guarantee the result of a later stage.

| Stage | API / operation | What it validates | Boundary |
| --- | --- | --- | --- |
| XML syntax | `validateSsml` | Well-formed XML, matching tags, and attribute/entity syntax | Azure voice, attribute, and style support; account state; and actual synthesis availability |
| Static semantics | `validateAzureSsml` | Required Azure SSML elements, attribute values, voice/`xml:lang` alignment, voice styles, character limits, and `audio` URL/origin policy | Azure's latest voice catalog, key/region permissions, service incidents, and the actual generated audio |
| Runtime | `AzureTtsClient.synthesize` / Azure Speech API | Account, region, key, current voice/style availability, service-side SSML constraints, and network state | It does not replace input validation or automatically provide SSRF protection |

Typed representations are available for elements such as `voice`, `prosody`, `break`, `express-as`, `say-as`, `phoneme`, `audio`, `lang`, and `mark`, plus `mstts:dialog`, `mstts:turn`, `mstts:backgroundaudio`, `mstts:ttsembedding`, `mstts:embedding`, and `mstts:voiceconversion`. Use `type: "custom"` and `name` to handle undefined XML elements or additional attributes. When a document contains `mstts:` elements, the required Azure Speech namespace is added automatically.

`mstts:turn` accepts either `voice` or the multi-talker `speaker` property. The typed extension properties include `speakerProfileId` for `mstts:ttsembedding`, `id` for `mstts:embedding`, and `url` plus `profile` for `mstts:voiceconversion`. `mstts:backgroundaudio` must be the first direct child element of `<speak>` and may appear only once per document; `fadein` and `fadeout` are raw milliseconds from 0 through 10000.

`validateAzureSsml` is a preflight static check performed by this package before sending SSML to Azure Speech. The `source` on each returned diagnostic identifies package-side static analysis; it is independent of Azure Speech's runtime generation result and does not guarantee that synthesis will succeed.

Use `mapSsmlTextNodes` to replace translatable content without changing tags, attributes, or nesting. The transform receives the immediate parent tag and ancestor `path`, and may return a `string` or a `Promise<string>`. The third argument supports `skipTags` and a `filter` callback; `phoneme`, `say-as`, and `sub` are skipped by default. The callback receives `parentTag`, decoded `parentAttributes`, `ancestorTags`, and `path`.

For migration workflows, use `extractSsmlTranslatableText` to produce only translation-target text, `validateSsmlStructureIntegrity` to detect tag or attribute changes after translation, and `fromPlainTextToSsml` to create a starter document with `<p>` and `<s>` elements.

```ts
const translated = await mapSsmlTextNodes(ssml, translate, {
  skipTags: ["phoneme", "say-as", "sub", "custom-no-translate"],
  filter: ({ parentAttributes, ancestorTags }) =>
    ancestorTags.includes("voice") && parentAttributes["xml:lang"] !== "en-US",
});
```

`validateAzureSsml` accepts `AzureValidationOptions` for extending the voice/style catalog. Language comparison uses `Intl.Locale` and BCP 47 normalization; the built-in aliases treat `zh-Hans` and `zh-CN`, and `zh-Hant` and `zh-TW`, as equivalent. Custom aliases or a custom normalizer can be injected as well.

```ts
const diagnostics = validateAzureSsml(ssml, {
  languageAliases: { ja: ["ja-JP", "ja-Japan"] },
  normalizeLanguage: (language) => language.replace("_", "-"),
});
```

URLs in `audio`, `mstts:backgroundaudio`, `lexicon`, and `mstts:voiceconversion` can be passed to `urlValidator` (or `customUrlValidator`). The callback receives `(url, context, signal)` and may be asynchronous, making it suitable for host-side DNS/private-IP and SSRF policy checks. Validation cache entries are isolated by tag, attribute, and URL.

The catalog is represented by `AzureVoiceDefinition` with `name`, `locale`, optional `secondaryLocales`, `styles`, `supportedTags`, `unsupportedTags`, `models`, `regions`, and `status`. Pass `voiceDefinitions` (or `voiceCatalog`) to supplement or override the built-in catalog with an external definition. A tag that violates `supportedTags` or `unsupportedTags` produces `azure-unsupported-tag-for-voice` with error severity. `customVoiceStyleMap` remains supported for backward compatibility and overrides styles for the named voice. Diagnostics distinguish an unregistered voice (`azure-unknown-voice`, controlled by `unknownVoicePolicy`), an unsupported style on a registered voice (`azure-unsupported-style`), and a locale mismatch (`azure-locale-mismatch`). The `<mstts:audioduration value="10s"/>` element accepts positive `ms` or `s` values and `hh:mm:ss[.fff]` clock values.

`npm run sync:voices -- --regions eastus,japaneast` fetches Azure's List Voices API for each region, deduplicates the results, and updates the generated TypeScript definitions plus `azureVoiceCatalog.json` with generation time, API version, regions, and voice count. Provide credentials through `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION(S)`, or CLI options.

```ts
const diagnostics = validateAzureSsml(ssml, {
  voiceDefinitions: [
    {
      name: "my-custom-voice",
      locale: "ja-JP",
      secondaryLocales: ["zh-Hant"],
      styles: ["narration"],
    },
  ],
  unknownVoicePolicy: "error", // "error" | "warn" | "ignore"
  allowedAudioOrigins: ["https://cdn.example.com"],
});
```

Azure's voice and style catalog changes over time and can differ by region, so the built-in catalog is a fixed snapshot rather than a complete live catalog. For complete static validation of a new voice, define its name, locale, and supported styles in `voiceDefinitions`. `validateNestedVoices` defaults to `true`. External `<audio>` URLs are blocked by default; provide `allowedAudioOrigins` or explicitly set `allowExternalAudio: true` only when the deployment is configured to control those requests.

To refresh the built-in voice catalog, set `AZURE_SPEECH_REGION` and `AZURE_SPEECH_KEY`, then run `npm run sync:voices`. The command updates the core voice definitions and editor style-completion map together.

```ts
const diagnostics = validateAzureSsml(ssml, {
  customVoiceStyleMap: { "my-custom-voice": ["narration"] },
  unknownVoicePolicy: "error", // "error" | "warn" | "ignore"
  allowedAudioOrigins: ["https://cdn.example.com"],
});
```

Azure Speech fetches `<audio>` URLs, so a server that accepts arbitrary user-provided SSML can become an SSRF proxy. For untrusted SSML, enforce HTTPS, an origin allowlist, redirect policy, and response-size limits on the server; do not treat `allowExternalAudio` as a substitute for those controls.

Long documents can be split into independently synthesizable `SsmlChunk` values:

```ts
import { splitSsmlDocument } from "ssml-builder-js/core";

const chunks = splitSsmlDocument(longSsml, 10_000);
for (const chunk of chunks) await client.synthesize(chunk.ssml);
```

Each chunk includes `chunkIndex`, `originalTextRange`, inherited voice/language/prosody context, contained markers, and background-audio state. Background audio is placed in the first chunk by default; pass `{ replicateBackgroundAudio: true }` as the third argument to include it in every chunk.

## Using `ssml-editor-react`

`SsmlEditor` accepts an `SsmlDocument` and renders only a toolbar and text display area. The toolbar applies rate, volume, and pitch settings to the selection and provides undo and redo actions. The application is responsible for selecting and displaying the voice. Monaco Editor is used for text editing, and SSML syntax is validated whenever the text changes. Syntax errors are shown with editor markers and an error message. Hovering over XML tag names or parameters shows SSML descriptions. Selecting text displays a floating action bar with the character count and preview action. When `enableCodeLens` is enabled (the default), CodeLens quick controls for editing and unwrapping `prosody` tags and editing or deleting `break` tags are shown above those tags. When `showDecorations` is enabled, inline badges for pause and pitch changes are rendered next to `break` and `prosody` tags, and Monaco inline decorations are enabled. Generated SSML is provided through `onSsmlChange` so the application can display it wherever it needs. Pass an `SsmlEditorRef` through `ref` to retrieve full, selected, or current-line SSML, and use `onSelectionChange` to observe selection text and state. The UI supports Japanese (the default) and English.

Set `editMode="visual"`, or choose **Visual** in the toolbar, to edit without viewing XML source. The structured editor provides a structure tree, parent breadcrumb selection, text editing, and form actions for rate, pitch, emotion, pause, and pronunciation. Azure placement and attribute diagnostics are shown in the visual area. Choose `editMode="code"` to return to Monaco.

The Visual Editor and Code Editor support the following elements:

| Element | Visual Editor | Code Editor |
| --- | --- | --- |
| `voice`, `prosody`, `break`, `express-as`, `say-as`, `phoneme` | Form actions and structure tree | Full support |
| `mstts:dialog` / `mstts:turn` | Add turns and edit voice, speaker, and text | Full support with completion |
| `mstts:backgroundaudio` | Edit URL, volume, fade-in, and fade-out | Full support with completion |
| `mstts:ttsembedding`, `mstts:embedding`, `mstts:voiceconversion` | Preserved in the structure tree | Full support |
| Unknown XML elements | Preserved in the structure tree | Editable as `custom` |

Azure lifecycle support is reported by static validation: GA elements produce no lifecycle diagnostic, preview elements and voices produce a Warning, and deprecated elements and voices produce an Info diagnostic. Use `AzureVoiceDefinition.status` and `AzureValidationOptions.tagStatuses` for external catalog metadata.

| Status | Diagnostic | Examples |
| --- | --- | --- |
| GA | None | Standard SSML, `mstts:dialog`, `mstts:backgroundaudio` |
| Preview | Warning | `mstts:voiceconversion`, tags listed in `previewTags` / `tagStatuses`, voices with `status: "preview"` |
| Deprecated | Info | Tags listed in `deprecatedTags` / `tagStatuses`, voices with `status: "deprecated"` |

Completion for the `<mstts:express-as>` `style` attribute and the built-in Emotion menu only show styles supported by the innermost `<voice name="...">` around the cursor or selection. When no voice name is available, all candidates are shown; a registered voice without supported styles or an explicitly unregistered voice displays an empty-state message. When `emotionStyles` is supplied, the Emotion menu uses its intersection with the registered voice's supported styles.

```tsx
import { useState } from "react";
import { SsmlEditor } from "ssml-builder-js/react";
import type { SsmlDocument } from "ssml-builder-js/core";

const initialDocument: SsmlDocument = {
  version: "1.0",
  lang: "en-US",
  children: ["Text to edit"],
};

export function App() {
  const [document, setDocument] = useState(initialDocument);
  const [ssml, setSsml] = useState("");

  return (
    <>
      <SsmlEditor
        document={document}
        onChange={setDocument}
        onSsmlChange={setSsml}
        locale="en"
      />
      <pre>{ssml}</pre>
    </>
  );
}
```

- `document`: The `SsmlDocument` being edited
- `onChange`: A callback that receives the edited `SsmlDocument`
- `onSsmlChange`: A callback that receives the generated SSML string
- `ref`: An `SsmlEditorRef`; `getFullSsml()` returns the full SSML, `getSelectedSsml()` returns the selected text (or the cursor line when it contains content), and `getCurrentLineSsml()` returns the current cursor line. The selection and line methods return `null` when their target is empty
- `onSelectionChange`: A callback that receives selected text, its character count, and whether a selection exists
- `onPreviewSelection`: A callback that receives the selected partial SSML when the floating preview action is pressed. The preview action is disabled when this callback is omitted; call an audio API such as Azure from the callback
- `editMode`: Initial editor mode (`"code"` or `"visual"`). Visual mode provides structured tree and form editing
- `locale`: The UI language (`"ja"` or `"en"`); defaults to `"ja"` and also controls hover-help translations
- `language`: Legacy name for `locale`, retained for compatibility; use `locale` in new code
- `showToolbar`: Whether to display the toolbar (defaults to `true`)
- `showToolbarIcons`: Whether to show toolbar icons (defaults to `true`)
- `showToolbarLabels`: Whether to show text labels on the toolbar (defaults to `false`); when omitted, hover over an icon to see its description
- `showDecorations`: Whether inline decorations such as badges and inlay hints are shown in the text (defaults to `false`); use the **Decorations** toolbar switch to toggle them at runtime
- `enableCodeLens`: Whether CodeLens quick controls for `prosody`, `break`, and `mstts:audioduration` tags are shown (defaults to `true`)
- `buttonVisibility`: Per-toolbar-button visibility settings for `help`, `break`, `emphasis`, `rate`, `pitch`, `volume`, `emotion`, `say-as`, `lang`, `mstts:silence`, `mstts:audioduration`, `undo`, `redo`, `clearAll`, `format`, `decorations`, and custom insertion IDs; unspecified buttons are shown
- `editorOptions` / `settings`: Monaco settings for `height`, `minHeight`, `readOnly`, `theme` (`system` / `light` / `dark`), `fontSize`, `wordWrap`, `lineNumbers`, `minimap`, and `automaticLayout`. The same settings can also be supplied as top-level props
- `loadingFallback`: A React node displayed while Monaco is loading
- `toolbarOrder`: Display order for all toolbar button IDs; unlisted buttons follow
- `toolbarGroups`: Groups all toolbar buttons with vertical separators using `{ id, buttonIds }`; groups are not rendered with borders
- `insertionOrder`: Display order for insertion menu IDs; also supplies the insertion order used when `toolbarOrder` is omitted
- `insertionGroups`: Groups insertion menus with vertical separators; when `toolbarGroups` is omitted, these groups also define the default toolbar groups. Menus are grouped into pauses, voice, expression, and pronunciation by default
- `emotionStyles`: Candidate voice styles shown by the `emotion` menu
- `customInsertions` / `additionalInsertions`: Custom SSML insertion definitions. `customInsertions` replaces a built-in definition with the same ID, while `additionalInsertions` adds definitions to the built-ins
- `customInspectors`: Custom renderers keyed by element type or serialized tag name for the Visual Editor
- `renderVoiceSelector`: Custom voice selector renderer. Supply `voiceCatalog` and optional `voiceLocale`, `voiceRegion`, or `voiceStyle` filters; preview status is included in each voice entry
- `voiceModel` (or `model`): Selected Azure voice model. The Visual Editor reports live mismatches between the catalog's supported models, SSML tags, styles, and locale
- `className` / `style`: A class name and inline styles for the editor container
- `toolbarClassName` / `toolbarStyle`: A class name and inline styles for the toolbar
- `displayClassName` / `displayStyle`: A class name and inline styles for the text display area
- Use the **Format** button to format the XML in the text display area
- Standalone elements (`break`, `mstts:silence`, `mstts:audioduration`, and custom insertions with `mode: "insert"`) are automatically placed on separate lines; elements that wrap a selection remain inline
- Changing the text validates SSML syntax and displays errors in the editor

The built-in insertion menus are `break`, `emphasis`, `rate`, `pitch`, `volume`, `emotion`, `say-as`, `lang`, `mstts:silence`, and `mstts:audioduration`. Their definitions are available through `SSML_INSERTIONS`. Custom insertion definitions can be supplied as an array or an object keyed by ID. Use `createSsmlEditorInsertionDefinition` to create a definition from a tag and one optional attribute; for arbitrary or multiple attributes, implement `createTemplate` on `SsmlEditorInsertionDefinition`.

Click the **Description** button to see descriptions of each control, button, and setting. Button settings are shown in accordions that are closed by default, with the button description and generated XML tag name as the accordion title and the meaning of each setting inside. The **Clear all** button preserves `voice` elements, removes the other XML elements, and leaves the text in place. The document's `version`, `lang`, and other attributes are also preserved.

## Using `ssml-editor-elements`

`ssml-builder-js/elements` registers a framework-independent `<ssml-editor>` Web Component without React. Install `monaco-editor` separately, then use the `value`, `theme`, and `readonly` attributes or properties. The component includes the same SSML toolbar and help display as the React editor; use `locale`, `show-toolbar`, `show-toolbar-labels`, and `show-decorations` to customize it. Set `edit-mode="visual"` or `editor.editMode = "visual"` to use the structured tree and form editor. Editing dispatches a `change` event whose `detail` is `{ value: string }`; visual preview dispatches a `preview-selection` event whose detail is `{ ssml: string }`.

```ts
import "ssml-builder-js/elements";
import type { SsmlEditorElement } from "ssml-builder-js/elements";

const editor = document.querySelector("ssml-editor") as SsmlEditorElement | null;
if (editor) {
  editor.value = '<speak version="1.0">Text to edit</speak>';
  editor.theme = "vs-dark";
  editor.locale = "en";
  editor.addEventListener("change", (event) => {
    console.log((event as CustomEvent<{ value: string }>).detail.value);
  });
}
```

## Using `azure-tts-client`

Pass an Azure Speech subscription key and region to `AzureTtsClient`, then pass SSML to `synthesize`. The return value is an `ArrayBuffer` containing audio data.

```ts
import { AzureTtsClient } from "ssml-builder-js";

const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});

const audio = await client.synthesize(ssml);
// audio is an audio/mpeg ArrayBuffer
```

For lower bandwidth, choose `audio-24khz-48kbitrate-mono-mp3` or `audio-16khz-32kbitrate-mono-mp3`.

Fetch the current voice catalog from Azure with `fetchAzureVoiceCatalog`. Multiple regions are deduplicated by voice name, and each voice includes its available `regions`; the result also contains `metadata` with `voiceCount`, `generatedAt`, `apiVersion`, and `regions`.

```ts
import { fetchAzureVoiceCatalog } from "ssml-builder-js";

const catalog = await fetchAzureVoiceCatalog({
  apiKey: process.env.AZURE_SPEECH_KEY!,
  region: ["eastus", "japaneast"],
});
```

同期情報が必要な場合は `synthesizeSsml`（または `AzureTtsClient.synthesizeSsml`）を使用します。SDK の 100 ナノ秒単位のオフセットはミリ秒へ変換されます。

```ts
import { synthesizeSsml } from "ssml-builder-js";

const result = await synthesizeSsml(ssml, {
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: process.env.AZURE_SPEECH_REGION!,
});
result.audioData; // ArrayBuffer
result.durationMs;
result.boundaries; // { text, audioOffsetMs, durationMs }[]
result.visemes; // { visemeId, audioOffsetMs }[]
result.bookmarks; // { name, audioOffsetMs }[]
```

長文を分割して合成する場合は `synthesizeSsmlChunks` または `AzureTtsClient.synthesizeChunks` を使います。音声バイナリを連結し、`boundaries`、`visemes`、`bookmarks` のオフセットを累積 `durationMs` 分だけ補正します。`synthesizeSsmlSafe(client, ssml, { validation })` は検証エラー時に Azure API を呼び出さず、`status: "validation-error"` / `"azure-api-error"` / `"success"` の結果を返します。

 v2.15.0 では `synthesizeSsmlChunksSafe(client, chunks, options)` が全チャンクを事前検証し、`outputFormat`、`signal`、`timeoutMs`、`sourceNodePath` を各合成へ伝播します。`mergeAudioBuffers(buffers, { format })` と `mergeSynthesisResults(results, { format })` は形式指定を必須とし、結合結果には `mimeType` が含まれます。Ogg/WebM などは `customMerger` で外部 Muxer に委譲できます。エラーは `validation-error`、`azure-api-error`、`merge-error`、`unsupported-format-error`、`cancelled`、`timeout` の判別可能な `kind` を持ちます。同期イベントは個別の `sourceNodePath` と `originalTextRange` にマッピングされ、URL 検証コールバックには `AbortSignal` が渡されます。

v2.16.0 では `concurrency` と `retryOptions`（429/5xx・ネットワーク障害のみ、Jitter 付き指数バックオフ）でチャンク合成を制御できます。`onProgress` には `retryAttempt`、`nextRetryDelayMs`、`isRetrying` が追加され、結合は常に `chunkIndex` 順です。`SsmlSynthesisResult.audioSpec` は WAV/MP3 ヘッダーから音声仕様を抽出し、チャンク間の仕様不一致は `AudioFormatMismatchError` になります。同期イベントには `mappingStatus`、Azure 診断には `nodePath`、`range`、`tagName`、`attributeName`、`voiceName`、`chunkIndex` が含まれます。`validateAzureSsmlChunks` は URL 検証プールを全チャンクで共有し、カスタム結合器には `inputSpecs` と `signal` を渡します。

v2.17.0 では `customMerger`、`outputMimeType`、`postMergeValidator` をチャンク合成の末尾まで構成でき、`BatchChunkValidationError` が全チャンクの診断と総エラー数を返します。`cancelOnFailure` と `resumeChunks` により成功済みバイナリを再利用でき、`timeouts`（URL 検証、チャンク、リトライ込みチャンク、ジョブ全体）を個別に設定できます。429 の `Retry-After` は指数バックオフより優先されます。`AudioSpecification` には `bitDepth`、`container`、`isVbr` が追加され、同期 `mappingStatus` は JSON 化後も保持されます。

v2.18.0 では `resumeChunks` に SSML・音声設定・出力形式のフィンガープリントを付与し、不一致のキャッシュを自動的に再合成します。`PartialChunkSynthesisResult.chunkStates` は成功、直接失敗、連鎖キャンセル、未実行を区別します。`totalJobMs` は単一合成にも適用され、上限を超える `Retry-After` は待機せずタイムアウトになります。`AzureTtsClient` の既定値として再試行、キャンセル、結合器、MIME、結合後検証、再開検証を注入できます。RAW 音声はサンプリング周波数、ビット深度、codec、フレーム境界を検証します。

v2.19.0 では、再開フィンガープリントに SSML、voice、言語、出力形式、リージョン、endpoint、custom headers、スキーマバージョンを含め、環境の異なるキャッシュの再利用を防ぎます。`resumeChunkIndices` の欠落は `IncompleteChunkSetError` で結合前に拒否され、`ChunkExecutionState.error` は JSON 化可能な `SerializedChunkError` になります。単一合成を含む URL 検証、再試行、チャンク合成、結合は絶対 deadline で制限され、Ogg/WebM/RAW Opus/SILK の実体ヘッダーも検証します。Visual editor は `expressAs` などの別名を正規化し、neural-HD の非対応タグを表示します。

`validateAzureSsml` の `urlValidation` オプションは URL の重複排除、キャッシュ、`concurrency`、`signal`、`timeoutMs` を制御します。

For long documents, use `synthesizeSsmlChunks` or `AzureTtsClient.synthesizeChunks`; `onProgress` reports completed chunks while audio and synchronization offsets are merged. `synthesizeSsmlSafe(client, ssml, { validation })` validates before synthesis and returns a discriminated result without calling Azure when static validation fails.

In v2.15.0, `synthesizeSsmlChunksSafe(client, chunks, options)` validates every chunk before contacting Azure and propagates `outputFormat`, `signal`, `timeoutMs`, and `sourceNodePath` to each synthesis. `mergeAudioBuffers(buffers, { format })` and `mergeSynthesisResults(results, { format })` require an explicit format and merged results expose `mimeType`. Ogg and WebM can be delegated to an external Muxer through `customMerger`. Errors have discriminated `kind` values: `validation-error`, `azure-api-error`, `merge-error`, `unsupported-format-error`, `cancelled`, and `timeout`. Synchronization events receive individual `sourceNodePath` and `originalTextRange` mappings, and URL validators receive an `AbortSignal`.

In v2.16.0, use `concurrency` and `retryOptions` to control chunk synthesis; only 429/5xx and network failures are retried with jittered exponential backoff. Progress events include `retryAttempt`, `nextRetryDelayMs`, and `isRetrying`, while merging always follows `chunkIndex` order. `SsmlSynthesisResult.audioSpec` is extracted from WAV/MP3 headers, and incompatible chunk specs throw `AudioFormatMismatchError`. Synchronization events include `mappingStatus`, diagnostics include structured node/range/tag/attribute/voice/chunk fields, `validateAzureSsmlChunks` shares one URL validation pool, and custom mergers receive `inputSpecs` and an `AbortSignal`.

In v2.17.0, configure `customMerger`, `outputMimeType`, and `postMergeValidator` through the chunk synthesis pipeline. `BatchChunkValidationError` aggregates diagnostics and the total error count for every invalid chunk. `cancelOnFailure` and `resumeChunks` allow successful binary chunks to be reused, while `timeouts` independently bounds URL validation, individual chunks, retries, and the total job. HTTP 429 `Retry-After` takes priority over exponential backoff. `AudioSpecification` now includes `bitDepth`, `container`, and `isVbr`, and `mappingStatus` remains present after JSON serialization.

In v2.18.0, `resumeChunks` carries a fingerprint of the SSML, voice settings, and output format; stale cache entries are automatically re-synthesized. `PartialChunkSynthesisResult.chunkStates` distinguishes succeeded, directly failed, chained-cancelled, and pending chunks. `totalJobMs` also bounds single synthesis, and an over-budget `Retry-After` fails immediately without sleeping. `AzureTtsClient` accepts retry, cancellation, merger, MIME, post-merge validation, and resume-validation defaults. RAW audio now validates sample rate, bit depth, codec, and frame alignment.

In v2.19.0, resume fingerprints include SSML, voice, language, output format, region, endpoint, custom headers, and schema version so cached chunks cannot cross synthesis environments. Missing `resumeChunkIndices` are rejected before merge with `IncompleteChunkSetError`, and `ChunkExecutionState.error` is a JSON-serializable `SerializedChunkError`. URL validation, retries, chunk synthesis, and merging share an absolute deadline, including single synthesis. Ogg/WebM/RAW Opus/SILK payloads receive concrete container or header validation, and the visual editor normalizes aliases such as `expressAs` while showing neural-HD unsupported tags.

The `urlValidation` option of `validateAzureSsml` provides URL deduplication, in-memory caching, bounded `concurrency`, `signal`, and `timeoutMs` controls.

The public updater CLI is `npx ssml-builder sync-voices --region eastus --output ./azure-voices.json`. It reads the key from `AZURE_SPEECH_KEY` (or `--key`) and regions from `AZURE_SPEECH_REGION(S)` (or `--region(s)`).

```ts
const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: process.env.AZURE_SPEECH_REGION!,
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  timeoutMs: 15_000,
});
```

The lower-level `synthesizeSpeech` function is also available. It requires
`endpoint`, `subscriptionKey`, and `region` in its `TtsConfig` argument.

```ts
import { synthesizeSpeech } from "ssml-builder-js";

const audio = await synthesizeSpeech(ssml, {
  endpoint: "https://japaneast.tts.speech.microsoft.com/tts/cognitiveservices/websocket/v1",
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});
```

Internally, the client uses the Microsoft Cognitive Services Speech SDK's `SpeechSynthesizer`. If `endpoint` is omitted from `AzureTtsClient`, `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` is used. The Playground example explicitly uses the WebSocket endpoint from `.env.example`. If a custom endpoint contains `{region}`, it is replaced with the configured region.
Empty or whitespace-only `endpoint` values also fall back to the regional endpoint. Pass a `logger` with optional `debug`, `info`, `warn`, and `error` methods to receive client diagnostics; when omitted, the client is silent.
Set `outputFormat` to a format supported by the Speech SDK. If omitted, `audio-16khz-128kbitrate-mono-mp3` is used.
`timeoutMs` bounds a synthesis request, while `signal` supports cancellation when a client disconnects. If adding retries, retry only transient SDK failures, pass the same `AbortSignal`, and use exponential backoff.

Keep the subscription key on the server by using a Next.js Route Handler (or an equivalent Node.js endpoint):

```ts
// app/api/synthesize/route.ts
import { AzureTtsClient, AzureTtsError } from "ssml-builder-js";
import { validateAzureSsml, validateSsml } from "ssml-builder-js/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { ssml?: unknown };
  if (typeof body.ssml !== "string" || validateSsml(body.ssml))
    return Response.json({ error: "Invalid SSML" }, { status: 400 });
  if (validateAzureSsml(body.ssml).some(({ severity }) => severity === "error"))
    return Response.json({ error: "Invalid Azure SSML" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const audio = await new AzureTtsClient({
      subscriptionKey: process.env.AZURE_SPEECH_KEY!,
      region: process.env.AZURE_SPEECH_REGION!,
      signal: controller.signal,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    }).synthesize(body.ssml);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
  } catch (error) {
    const status = error instanceof AzureTtsError && error.status === 0 ? 504 : 502;
    return Response.json({ error: "Speech synthesis failed" }, { status });
  } finally {
    clearTimeout(timeout);
  }
}
```

Do not log the SSML body or subscription key. If external `audio` is allowed, validate its origins before synthesis and keep the same SSRF controls in place.

Speech SDK synthesis errors throw `AzureTtsSdkError` (a subclass of `AzureTtsError`); its `errorDetails` field contains the SDK error details. Because the SDK does not expose HTTP status or request IDs, SDK errors use `0` for `status`, `"Speech SDK"` for `statusText`, and `null` for `requestId`. The playground's server-side logs include these fields along with the region and SSML character count. Logged error details are limited to 4,096 characters. The subscription key and SSML content itself are not written to logs.

The subscription key is sent in a request header, so do not hard-code it in source code or write it to logs. Calling Azure TTS directly from a browser exposes the key to users; a server-side Azure TTS integration is normally recommended.

## Specifications and references

This project primarily targets the SSML implementation provided by Azure Speech. Azure Speech's SSML implementation is based on W3C SSML Version 1.0, but its supported elements and behavior can differ from the W3C standard and include Azure-specific `mstts:` extensions.

- [Azure Speech SSML document structure and events (Microsoft Learn)](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-structure)
- [Azure Speech SSML reference (Microsoft Learn)](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup)
- [Speech Synthesis Markup Language (SSML) Version 1.0 (W3C Recommendation)](https://www.w3.org/TR/2004/REC-speech-synthesis-20040907/)
- Reference version: **W3C SSML 1.0** (Recommendation dated September 7, 2004). Microsoft Learn's Azure Speech documentation does not expose a fixed product version, so check the linked documentation for the latest Azure behavior when using this project.

## Development commands

Run the following commands from the repository root:

| Command | Description |
| --- | --- |
| `npm run format` | Check formatting with Biome |
| `npm run format:write` | Apply formatting with Biome |
| `npm run lint` | Run static checks with Biome |
| `npm run check` | Run Biome formatting and lint checks together |
| `npm run typecheck` | Type-check all workspaces with TypeScript |
| `npm run build` | Build each package |
| `npm test` | Run tests for each package |

To run the same checks as CI:

```sh
npm run format
npm run lint
npm run typecheck
npm run build
npm test
```

`dist/` and `packages/*/dist` contain generated build files; do not edit or commit them directly.
