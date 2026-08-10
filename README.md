# SSML-Builder

Azure Speech Service で利用できる SSML を、TypeScript のデータ構造から生成・解析し、React の GUI で編集するための npm ワークスペースモノレポです。

SSML の XML エスケープや Azure Speech 拡張要素に対応したコアライブラリ、Monaco Editor を利用した React コンポーネント、Azure Text-to-Speech API クライアントを個別のパッケージとして提供します。

## パッケージ構成

| パッケージ | 内容 |
| --- | --- |
| `@ssml-builder/ssml-core` | SSML の型定義、ドキュメントの生成（`buildSsml`）、XML からの解析（`parseSsml`） |
| `@ssml-builder/ssml-editor-react` | 音声、速度、音量、ピッチ、本文を編集し、生成された SSML を確認できる `SsmlEditor` コンポーネント |
| `@ssml-builder/azure-tts-client` | SSML を Azure Text-to-Speech に送信し、音声データを `ArrayBuffer` で取得するクライアント |

## セットアップ

### npm パッケージとして利用する場合

公開済みのパッケージを利用するアプリケーションでは、必要なパッケージをインストールします。

```sh
npm install @ssml-builder/ssml-core
```

React エディタを使用する場合は、React と Monaco Editor のアダプターもインストールします。

```sh
npm install @ssml-builder/ssml-editor-react @monaco-editor/react react react-dom
```

Azure TTS クライアントを使用する場合は、次のパッケージを追加します。

```sh
npm install @ssml-builder/azure-tts-client
```

### リポジトリを開発する場合

Node.js 24 以降を用意し、リポジトリのルートで依存関係をインストールします。

```sh
npm ci
```

## `ssml-core` の利用方法

`SsmlDocument` は `version`、`lang`、`children` を持つオブジェクトです。`children` には文字列、テキストノード、SSML 要素を入れられます。`children` を使う形式が推奨され、旧形式の `content` プロパティも `buildSsml` の入力として利用できます。

```ts
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";

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
| `parseSsml(xml)` | `<speak>` XML を `SsmlDocument` に変換 |

`voice`、`prosody`、`break`、`express-as`、`say-as`、`phoneme`、`audio`、`lang`、`mark` などの要素を型付きで表現できます。`type: "custom"` と `name` を指定すれば、未定義の XML 要素や追加属性も扱えます。`mstts:` 要素を含むドキュメントを生成すると、必要な Azure Speech 名前空間が自動的に追加されます。

## `ssml-editor-react` の利用方法

`SsmlEditor` は `SsmlDocument` を受け取り、音声名、速度、音量、ピッチ、本文を編集できるコントロールを表示します。本文の編集には Monaco Editor を使用し、XML のタグ名やパラメータへホバーすると SSML の説明を確認できます。`Generated SSML` の項目から現在の XML も確認できます。

```tsx
import { useState } from "react";
import { SsmlEditor } from "@ssml-builder/ssml-editor-react";
import type { SsmlDocument } from "@ssml-builder/ssml-core";

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
      />
      <pre>{ssml}</pre>
    </>
  );
}
```

- `document`: 編集対象の `SsmlDocument`
- `onChange`: 編集後の `SsmlDocument` を受け取るコールバック
- `onSsmlChange`: 編集後に生成された SSML 文字列を受け取るコールバック

## `azure-tts-client` の利用方法

`AzureTtsClient` に Azure Speech のサブスクリプションキーとリージョンを渡し、`synthesize` に SSML を渡します。戻り値は音声データの `ArrayBuffer` です。

```ts
import { AzureTtsClient } from "@ssml-builder/azure-tts-client";

const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});

const audio = await client.synthesize(ssml);
// audio は audio/mpeg の ArrayBuffer
```

エンドポイントを明示する場合は `endpoint` を指定できます。省略すると `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` が使用されます。独自エンドポイントに `{region}` を含めた場合は、設定したリージョンに置き換えられます。

サブスクリプションキーはリクエストヘッダーに含まれるため、ソースコードへハードコードしたりログへ出力したりしないでください。ブラウザから直接呼び出す場合はキーが利用者へ公開されるため、通常はサーバー側で Azure TTS を呼び出す構成にします。

## 開発用コマンド

リポジトリのルートで次のコマンドを実行できます。

| コマンド | 内容 |
| --- | --- |
| `npm run format` | Biome によるフォーマットチェック |
| `npm run format:write` | Biome によるフォーマット適用 |
| `npm run lint` | Biome による静的チェック |
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

`packages/*/dist` はビルド時に生成されるファイルのため、直接編集したりコミットしたりしないでください。
