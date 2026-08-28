import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, parseSsml, splitSsmlDocument, validateAzureSsml } from "../src/index.ts";

const longDocument = `<speak version="1.0" xml:lang="ja-JP"><voice name="ja-JP-NanamiNeural"><prosody rate="slow"><p>第一段落の本文です。音声コンテキストを保持します。</p><p>第二段落の本文です。別のブロックとして分割されます。</p></prosody></voice></speak>`;

test("splitSsmlDocument keeps speak, voice, and prosody context in every block", () => {
  const chunks = splitSsmlDocument(longDocument, 180);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 180);
    const parsed = parseSsml(chunk);
    assert.equal(buildSsml(parsed), chunk);
    assert.match(chunk, /<voice name="ja-JP-NanamiNeural">/);
    assert.match(chunk, /<prosody rate="slow">/);
    assert.deepEqual(validateAzureSsml(chunk, { unknownVoicePolicy: "ignore" }), []);
  }
});

test("splitSsmlDocument splits oversized text while keeping valid XML", () => {
  const source = `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><s>${"word ".repeat(100)}</s></voice></speak>`;
  const chunks = splitSsmlDocument(source, 220);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 220);
    assert.doesNotThrow(() => parseSsml(chunk));
  }
});

test("validateAzureSsml enforces maxXmlDepth for audio elements too", () => {
  const source = `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><prosody><audio src="https://allowed.test/a.mp3"/></prosody></voice></speak>`;
  const diagnostics = validateAzureSsml(source, { allowedAudioOrigins: ["https://allowed.test"], maxXmlDepth: 3 });

  assert.ok(diagnostics.some(({ message }) => message.includes("exceeds the configured maximum of 3")));
});
