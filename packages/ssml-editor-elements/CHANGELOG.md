# @ssml-builder-js/ssml-editor-elements

## 2.19.0

### Patch Changes

- @ssml-builder-js/ssml-core@2.19.0

## 2.18.0

### Patch Changes

- @ssml-builder-js/ssml-core@2.18.0

## 2.17.0

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.17.0

## 2.16.0

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.16.0

## 2.15.0

### Minor Changes

- Add strict audio merge formats, discriminated synthesis errors, per-event source mappings, abortable URL validation, external audio muxers, and live Visual Editor voice capability warnings.

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.15.0

## 2.14.0

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.14.0

## 2.13.0

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.13.0

## 2.12.0

### Minor Changes

- Update the wrapped React editor to v2.12.0.

## 2.11.0

### Minor Changes

- Release v2.11.0 with Azure voice catalog APIs and synchronization tools, expanded editor voice support, and stricter background audio validation.

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.11.0

## 2.10.0

### Minor Changes

- Release v2.10.0 with expanded Azure SSML extension attributes, stricter background audio and multi-talker validation, and updated package entrypoint documentation.

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.10.0

## 2.9.0

### Minor Changes

- Release v2.9.0 with Azure SSML validation and migration utilities, voice catalog support, and visual/editor improvements.

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.9.0

## 2.8.1

### Patch Changes

- ba09a72: Prepare the v2.8.1 patch release.
- Updated dependencies [ba09a72]
  - @ssml-builder-js/ssml-core@2.8.1

## 2.8.0

### Patch Changes

- Updated dependencies [c7c8cb4]
  - @ssml-builder-js/ssml-core@2.8.0

## 2.7.0

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.7.0

## 2.6.0

### Patch Changes

- Update the package version and workspace dependency references for the v2.6.0 release.
- Updated dependencies
  - @ssml-builder-js/ssml-core@2.6.0

## 2.5.0

### Patch Changes

- Update the package version for the v2.5.0 workspace release.
- Updated dependencies
  - @ssml-builder-js/ssml-core@2.5.0

## 2.4.0

### Minor Changes

- Add SSML text-node translation helpers and Azure semantic validation, improve Azure TTS endpoint and logger handling, support React 18 peer dependencies, and complete independent package publishing metadata.

### Patch Changes

- Updated dependencies
  - @ssml-builder-js/ssml-core@2.4.0

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

### Patch Changes

- Updated dependencies [e124614]
  - @ssml-builder-js/ssml-core@2.2.0
