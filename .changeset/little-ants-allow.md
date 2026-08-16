---
"ssml-builder-js": patch
"playground": patch
"@ssml-builder-js/azure-tts-client": patch
"@ssml-builder-js/ssml-core": patch
"@ssml-builder-js/ssml-editor-react": patch
---

---
"ssml-builder-js": patch
"@ssml-builder-js/ssml-editor-react": patch
"@ssml-builder-js/ssml-core": patch
"@ssml-builder-js/azure-tts-client": patch
"playground": patch

---

- **`<mstts:express-as>` のスタイル動的フィルタリング:** 親要素の `<voice name="...">` に応じて利用可能な感情スタイル（`style`）のみを自動補完・Popover 選択肢へ動的に絞り込む機能を追加。
- **Quick Fix (CodeAction) の拡張:** 未閉じタグの自動補完挿入および無効な属性値の 1 クリック修正に対応。
- **自動補完およびエディタ内部設計の最適化:** 入力時の Range 置換精度の改善および Popover コンポーネント・状態管理のモジュール分離を実施。
