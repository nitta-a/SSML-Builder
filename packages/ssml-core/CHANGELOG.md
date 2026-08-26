# @ssml-builder-js/ssml-core

## 2.4.0

### Minor Changes

- Add SSML text-node translation helpers and Azure semantic validation, improve Azure TTS endpoint and logger handling, support React 18 peer dependencies, and complete independent package publishing metadata.

## 2.3.0

## 2.2.0

### Minor Changes

- e124614: ---

  "@ssml-builder-js/ssml-editor-elements": minor
  "@ssml-builder-js/ssml-editor-react": minor
  "@ssml-builder-js/ssml-core": minor
  "@ssml-builder-js/azure-tts-client": minor
  "playground": minor

  ***

  - **Web Components サポート (`@ssml-builder-js/ssml-editor-elements`) の追加**
    - フレームワーク非依存で利用可能な `<ssml-editor>` カスタム要素（Custom Element）パッケージを新設。
    - ルートパッケージからのエクスポート（`ssml-builder-js/elements`）および Playground での React / Web Components 切り替え動作環境を整備。
  - **多言語音声モデル（Voice）ごとの感情スタイル動的フィルタリングの拡充**
    - 日本語（`ja-JP`）、英語（`en-US`）、中国語（`zh-CN`）、韓国語、欧州言語等の Neural 音声モデルに対応する発話スタイル一覧を公式仕様に合わせて網羅。
    - 感情非対応の音声モデルに対する disabled 表示・フォールバック処理を実装。
  - **スタイル選択 UI の `<optgroup>` カテゴリ分類**
    - `ProsodyPopovers` 内のスタイル選択肢を「感情・トーン（Emotions）」「会話・シナリオ（Scenarios）」「メディア・報道（Media）」にグループ化し、視認性と操作性を向上。
  - **ツールバーのアクティブタグ状態表示 (Active State Feedback)**

    - エディタ内のカーソル位置（キャレット）を囲む SSML タグをリアルタイムに検知し、対応するツールバーボタン（Prosody, Style 等）をハイライト表示する機能を追加。

  - モノレポ各パッケージのビルド設定（tsup）および型定義エクスポート（dts）を最適化。

## 2.1.0

### Patch Changes

- 845a6d3: - **`<mstts:express-as>` のスタイル動的フィルタリング:** 親要素の `<voice name="...">` に応じて利用可能な感情スタイル（`style`）のみを自動補完・Popover 選択肢へ動的に絞り込む機能を追加。
  - **Quick Fix (CodeAction) の拡張:** 未閉じタグの自動補完挿入および無効な属性値の 1 クリック修正に対応。
  - **自動補完およびエディタ内部設計の最適化:** 入力時の Range 置換精度の改善および Popover コンポーネント・状態管理のモジュール分離を実施。

## 2.0.0

### Major Changes

- 4935073: ---

## 1.0.0

### Major Changes

- 6c78e70: chore: initial release
