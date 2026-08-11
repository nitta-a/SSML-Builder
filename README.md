# SSML-Builder

- [日本語](#日本語)
- [English](#english)

## 日本語

Azure Speech Service で利用できる SSML を、TypeScript のデータ構造から生成・解析し、React の GUI で編集するための npm ワークスペースモノレポです。

SSML の XML エスケープや Azure Speech 拡張要素に対応したコアライブラリ、Monaco Editor を利用した React コンポーネント、Azure Text-to-Speech API クライアントを個別のパッケージとして提供します。

## パッケージ構成

| パッケージ | 内容 |
| --- | --- |
| `@ssml-builder/ssml-core` | SSML の型定義、ドキュメントの生成（`buildSsml`）、XML からの解析（`parseSsml`）、構文検証（`validateSsml`） |
| `@ssml-builder/ssml-editor-react` | ツールバーと本文の表示エリアを備えた `SsmlEditor` コンポーネント |
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

`lang` は読み上げ言語を表す BCP-47 タグで、パッケージ外部から `SsmlDocument` に設定します。`SsmlEditor` の `language` は画面表示言語の設定であり、読み上げ言語とは別です。

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
| `validateSsml(xml)` | SSML の構文エラーを `{ message, position }` または `null` で返す |

`voice`、`prosody`、`break`、`express-as`、`say-as`、`phoneme`、`audio`、`lang`、`mark` などの要素を型付きで表現できます。`type: "custom"` と `name` を指定すれば、未定義の XML 要素や追加属性も扱えます。`mstts:` 要素を含むドキュメントを生成すると、必要な Azure Speech 名前空間が自動的に追加されます。

## `ssml-editor-react` の利用方法

`SsmlEditor` は `SsmlDocument` を受け取り、ツールバーと本文の表示エリアだけを表示するシンプルなコンポーネントです。ツールバーから選択範囲の速度、音量、ピッチなどの設定、元に戻す・やり直す操作ができます。音声の選択と表示はアプリ側で行います。本文の編集には Monaco Editor を使用し、変更時に SSML の構文を検証します。構文エラーはエディター上のマーカーとエラーメッセージで表示されます。XML のタグ名やパラメータへホバーすると SSML の説明を確認できます。生成された SSML は `onSsmlChange` で受け取り、アプリ側で自由に表示できます。画面表示は日本語（デフォルト）と英語に対応しています。

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
        language="ja"
      />
      <pre>{ssml}</pre>
    </>
  );
}
```

- `document`: 編集対象の `SsmlDocument`
- `onChange`: 編集後の `SsmlDocument` を受け取るコールバック
- `onSsmlChange`: 編集後に生成された SSML 文字列を受け取るコールバック
- `language`: 画面表示の言語（`"ja"` または `"en"`）。省略時は `"ja"`
- `showToolbarIcons`: ツールバーのアイコン表示（デフォルトは `true`）
- `showToolbarLabels`: ツールバーの文字による説明表示（デフォルトは `false`）。省略時はアイコンにホバーすると説明が表示されます
- `buttonVisibility`: ボタンごとの表示設定。`help`、`break`、`emphasis`、`rate`、`pitch`、`volume`、`emotion`、`say-as`、`phoneme`、`audio`、`sub`、`lang`、`mark`、`bookmark`、`mstts:silence`、`mstts:viseme`、`undo`、`redo`、`clearAll`、`format`、カスタム挿入 ID を指定でき、未指定のボタンは表示されます
- `editorOptions` / `settings`: Monaco の設定。`height`、`minHeight`、`readOnly`、`theme`（`system` / `light` / `dark`）、`fontSize`、`wordWrap`、`lineNumbers`、`minimap`、`automaticLayout` を指定できます。これらは同名のトップレベル props でも指定できます
- `insertionOrder`: 挿入メニューの ID の表示順。指定されていないメニューは後ろに続きます
- `insertionGroups`: 挿入メニューをツールバー上でグループ化する設定
- `emotionStyles`: `emotion` メニューに表示する Azure 音声スタイル候補
- `customInsertions` / `additionalInsertions`: カスタム SSML 挿入定義。`customInsertions` は同じ ID の標準定義を置き換え、`additionalInsertions` は標準定義へ追加します
- `className` / `style`: エディター全体のクラス名とインラインスタイル
- `toolbarClassName` / `toolbarStyle`: ツールバーのクラス名とインラインスタイル
- `displayClassName` / `displayStyle`: 本文表示エリアのクラス名とインラインスタイル
- ツールバーの「フォーマット」ボタンで本文の XML を整形できます
- 本文を変更すると SSML 構文を検証し、エラー箇所をエディター上に表示します

標準の挿入メニューには `audio`、`sub`、`lang`、`mark`、`bookmark`、`mstts:silence`、`mstts:viseme` も含まれます。カスタム要素は `createSsmlEditorInsertionDefinition` でタグ名と属性を指定して作成できます。任意の属性や複数属性が必要な場合は `SsmlEditorInsertionDefinition` の `createTemplate` を実装してください。

本文ツールバーの「説明」ボタンを押すと、各コントロール、ボタン、パラメータの説明を表示できます。ボタンのパラメータはアコーディオンで表示され、デフォルトでは閉じています。「全てクリア」ボタンは XML 要素だけを削除し、本文を残します。ドキュメントの `version`、`lang`、その他の属性は保持されます。

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

## 仕様と参照元

このプロジェクトは Azure Speech における SSML の実装を主な対象としています。Azure Speech の SSML 実装は W3C の SSML Version 1.0 をベースにしていますが、対応要素や動作は W3C 標準と異なる場合があり、Azure 固有の `mstts:` 拡張も含まれます。

- [Azure Speech SSML のドキュメント構造とイベント（Microsoft Learn）](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure)
- [Azure Speech SSML リファレンス（Microsoft Learn）](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-reference)
- [Speech Synthesis Markup Language (SSML) Version 1.0（W3C Recommendation）](https://www.w3.org/TR/2004/REC-speech-synthesis-20040907/)
- 参照バージョン: **W3C SSML 1.0**（2004 年 9 月 7 日勧告）。Microsoft Learn の Azure Speech ドキュメントには固定された製品バージョン番号がないため、利用時は上記リンク先の最新の仕様も確認してください。

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

## English

SSML-Builder is an npm workspace monorepo for generating and parsing SSML supported by Azure Speech Service from TypeScript data structures and editing it in a React GUI.

It provides separate packages for a core library with XML escaping and Azure Speech extension support, a React component based on Monaco Editor, and an Azure Text-to-Speech API client.

## Package structure

| Package | Description |
| --- | --- |
| `@ssml-builder/ssml-core` | SSML type definitions, document generation (`buildSsml`), XML parsing (`parseSsml`), and syntax validation (`validateSsml`) |
| `@ssml-builder/ssml-editor-react` | The `SsmlEditor` component with a toolbar and text display area |
| `@ssml-builder/azure-tts-client` | A client that sends SSML to Azure Text-to-Speech and returns audio data as an `ArrayBuffer` |

## Setup

### Using the npm packages

Install the packages required by your application:

```sh
npm install @ssml-builder/ssml-core
```

To use the React editor, also install React and the Monaco Editor adapter:

```sh
npm install @ssml-builder/ssml-editor-react @monaco-editor/react react react-dom
```

To use the Azure TTS client, add the following package:

```sh
npm install @ssml-builder/azure-tts-client
```

### Developing this repository

Install Node.js 24 or later, then install dependencies from the repository root:

```sh
npm ci
```

## Using `ssml-core`

`SsmlDocument` is an object with `version`, `lang`, and `children` properties. `children` can contain strings, text nodes, and SSML elements. The `children` form is recommended; the legacy `content` property is also accepted as input by `buildSsml`.

`lang` is the BCP-47 tag for speech synthesis and is set on `SsmlDocument` by the package consumer. `SsmlEditor`'s `language` prop controls the UI language and is separate from the speech language.

```ts
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";

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
| `parseSsml(xml)` | Converts a `<speak>` XML document into an `SsmlDocument` |
| `validateSsml(xml)` | Returns `{ message, position }` for a syntax error, or `null` |

Typed representations are available for elements such as `voice`, `prosody`, `break`, `express-as`, `say-as`, `phoneme`, `audio`, `lang`, and `mark`. Use `type: "custom"` and `name` to handle undefined XML elements or additional attributes. When a document contains `mstts:` elements, the required Azure Speech namespace is added automatically.

## Using `ssml-editor-react`

`SsmlEditor` accepts an `SsmlDocument` and renders only a toolbar and text display area. The toolbar applies rate, volume, and pitch settings to the selection and provides undo and redo actions. The application is responsible for selecting and displaying the voice. Monaco Editor is used for text editing, and SSML syntax is validated whenever the text changes. Syntax errors are shown with editor markers and an error message. Hovering over XML tag names or parameters shows SSML descriptions. Generated SSML is provided through `onSsmlChange` so the application can display it wherever it needs, and the UI supports Japanese (the default) and English.

```tsx
import { useState } from "react";
import { SsmlEditor } from "@ssml-builder/ssml-editor-react";
import type { SsmlDocument } from "@ssml-builder/ssml-core";

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
        language="en"
      />
      <pre>{ssml}</pre>
    </>
  );
}
```

- `document`: The `SsmlDocument` being edited
- `onChange`: A callback that receives the edited `SsmlDocument`
- `onSsmlChange`: A callback that receives the generated SSML string
- `language`: The UI language (`"ja"` or `"en"`); defaults to `"ja"`
- `showToolbarIcons`: Whether to show toolbar icons (defaults to `true`)
- `showToolbarLabels`: Whether to show text labels on the toolbar (defaults to `false`); when omitted, hover over an icon to see its description
- `buttonVisibility`: Per-button visibility settings for `help`, `break`, `emphasis`, `rate`, `pitch`, `volume`, `emotion`, `say-as`, `phoneme`, `audio`, `sub`, `lang`, `mark`, `bookmark`, `mstts:silence`, `mstts:viseme`, `undo`, `redo`, `clearAll`, `format`, and custom insertion IDs; unspecified buttons are shown
- `editorOptions` / `settings`: Monaco settings for `height`, `minHeight`, `readOnly`, `theme` (`system` / `light` / `dark`), `fontSize`, `wordWrap`, `lineNumbers`, `minimap`, and `automaticLayout`. The same settings can also be supplied as top-level props
- `insertionOrder`: Display order for insertion menu IDs; unlisted menus follow
- `insertionGroups`: Groups insertion menus visually in the toolbar
- `emotionStyles`: Candidate Azure voice styles shown by the `emotion` menu
- `customInsertions` / `additionalInsertions`: Custom SSML insertion definitions. `customInsertions` replaces a built-in definition with the same ID, while `additionalInsertions` adds definitions to the built-ins
- `className` / `style`: A class name and inline styles for the editor container
- `toolbarClassName` / `toolbarStyle`: A class name and inline styles for the toolbar
- `displayClassName` / `displayStyle`: A class name and inline styles for the text display area
- Use the **Format** button to format the XML in the text display area
- Changing the text validates SSML syntax and displays errors in the editor

The built-in insertion menus also include `audio`, `sub`, `lang`, `mark`, `bookmark`, `mstts:silence`, and `mstts:viseme`. Use `createSsmlEditorInsertionDefinition` to create a custom insertion from a tag and one attribute. For arbitrary or multiple attributes, implement `createTemplate` on `SsmlEditorInsertionDefinition`.

Click the **Description** button in the text toolbar to see descriptions of each control, button, and parameter. Button parameters are shown in accordions that are closed by default. The **Clear all** button removes only XML elements and leaves the text in place. The document's `version`, `lang`, and other attributes are preserved.

## Using `azure-tts-client`

Pass an Azure Speech subscription key and region to `AzureTtsClient`, then pass SSML to `synthesize`. The return value is an `ArrayBuffer` containing audio data.

```ts
import { AzureTtsClient } from "@ssml-builder/azure-tts-client";

const client = new AzureTtsClient({
  subscriptionKey: process.env.AZURE_SPEECH_KEY!,
  region: "japaneast",
});

const audio = await client.synthesize(ssml);
// audio is an audio/mpeg ArrayBuffer
```

Set `endpoint` to use an explicit endpoint. If omitted, `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` is used. If a custom endpoint contains `{region}`, it is replaced with the configured region.

The subscription key is sent in a request header, so do not hard-code it in source code or write it to logs. Calling Azure TTS directly from a browser exposes the key to users; a server-side Azure TTS integration is normally recommended.

## Specifications and references

This project primarily targets the SSML implementation provided by Azure Speech. Azure Speech's SSML implementation is based on W3C SSML Version 1.0, but its supported elements and behavior can differ from the W3C standard and include Azure-specific `mstts:` extensions.

- [Azure Speech SSML document structure and events (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure)
- [Azure Speech SSML reference (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-reference)
- [Speech Synthesis Markup Language (SSML) Version 1.0 (W3C Recommendation)](https://www.w3.org/TR/2004/REC-speech-synthesis-20040907/)
- Reference version: **W3C SSML 1.0** (Recommendation dated September 7, 2004). Microsoft Learn's Azure Speech documentation does not expose a fixed product version, so check the linked documentation for the latest Azure behavior when using this project.

## Development commands

Run the following commands from the repository root:

| Command | Description |
| --- | --- |
| `npm run format` | Check formatting with Biome |
| `npm run format:write` | Apply formatting with Biome |
| `npm run lint` | Run static checks with Biome |
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

`packages/*/dist` contains generated build files; do not edit or commit them directly.
