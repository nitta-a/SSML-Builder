import assert from "node:assert/strict";
import test from "node:test";
import { extractSsmlTranslatableText, fromPlainTextToSsml, validateSsmlStructureIntegrity } from "../src/index.ts";

test("extractSsmlTranslatableText skips pronunciation and substitution payloads", () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><p>Hello <phoneme alphabet="ipa" ph="həˈləʊ">ignored</phoneme><sub alias="world">ignored</sub>world.</p></speak>';
  assert.deepEqual(extractSsmlTranslatableText(ssml), ["Hello ", "world."]);
  assert.deepEqual(extractSsmlTranslatableText(ssml, { includeWhitespace: true }), ["Hello ", "world."]);
});

test("fromPlainTextToSsml creates paragraphs and sentences and escapes XML", () => {
  const ssml = fromPlainTextToSsml("Hello world.\nNext sentence!\n\n第二段。", {
    lang: "ja-JP",
    voice: "ja-JP-NanamiNeural",
  });
  assert.match(ssml, /<speak version="1\.0" xml:lang="ja-JP"/);
  assert.match(
    ssml,
    /<voice name="ja-JP-NanamiNeural"><p><s>Hello world\.<\/s><s>Next sentence!<\/s><\/p><p><s>第二段。<\/s><\/p><\/voice>/,
  );
  assert.equal(fromPlainTextToSsml("A < B", { includeSentences: false }).includes("A &lt; B"), true);
});

test("validateSsmlStructureIntegrity accepts text-only translation and rejects structure changes", () => {
  const original =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><p><s>Hello</s></p></voice></speak>';
  const translated =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><p><s>こんにちは</s></p></voice></speak>';
  assert.equal(validateSsmlStructureIntegrity(original, translated).isValid, true);

  const changed =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><s>こんにちは</s></voice></speak>';
  const result = validateSsmlStructureIntegrity(original, changed);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.mismatchedTags.includes("p"));
});
