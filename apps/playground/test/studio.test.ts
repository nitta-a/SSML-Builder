import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, parseSsml, validateAzureSsml, validateSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument, VoiceElement } from "@ssml-builder-js/ssml-core";
import {
  assertImportSize,
  createCaptionTrack,
  createTemplateDocument,
  createTextDocument,
  downloadName,
  getDefaultVoice,
  getDocumentChildren,
  getPrimaryProsody,
  getPrimaryVoice,
  getRateMultiplier,
  getSpeechLanguage,
  importDraft,
  inspectProject,
  MAX_IMPORT_BYTES,
  MAX_TITLE_LENGTH,
  projectFromDraft,
  readDraftSnapshot,
  rewriteTextDocument,
  SPEECH_LANGUAGES,
  updateProsody,
  updateVoice,
  VOICE_OPTIONS,
} from "../app/studio.ts";
import { COMPOSER_COPY, getTemplateLanguage, isStudioLocale, LOCALE_OPTIONS, STUDIO_COPY } from "../app/studioCopy.ts";

function inspect(document: SsmlDocument) {
  return inspectProject({ document, ssml: buildSsml(document) });
}

test("every localized use-case template is valid, readable, and ready for synthesis", () => {
  for (const locale of LOCALE_OPTIONS) {
    assert.equal(isStudioLocale(locale.value), true);
    const language = getTemplateLanguage(locale.value);
    const copy = STUDIO_COPY[locale.value];
    assert.ok(COMPOSER_COPY[locale.value].rewriteHint.length > 0);
    for (const id of ["announcement", "narration", "learning"] as const) {
      const template = copy.template[id];
      const document = createTemplateDocument(template.text, language, id);
      const ssml = buildSsml(document);
      assert.equal(validateSsml(ssml), null, `${locale.value}/${id}`);
      assert.deepEqual(
        validateAzureSsml(ssml).filter((item) => item.severity === "error"),
        [],
        `${locale.value}/${id}`,
      );
      assert.equal(getPrimaryVoice(document)?.name, getDefaultVoice(language));
      assert.equal(getPrimaryProsody(document)?.rate, id === "learning" ? "slow" : "medium");
      assert.equal(inspect(document).canSynthesize, true);
      assert.equal(inspect(document).paragraphs, template.text.split(/\n\s*\n/).length);
      assert.equal(inspect(document).text.includes("\n\n\n"), false);
      assert.ok(inspect(document).estimatedSeconds > 0);
    }
  }
  assert.equal(isStudioLocale("unknown"), false);
  assert.equal(isStudioLocale(null), false);
});

test("starter voices cover each language and its equivalent Azure locale", () => {
  assert.equal(VOICE_OPTIONS.length, SPEECH_LANGUAGES.length * 2);
  for (const language of SPEECH_LANGUAGES) {
    assert.equal(getSpeechLanguage(language.prefix), language.value);
    for (const gender of ["female", "male"] as const) {
      assert.ok(VOICE_OPTIONS.some((voice) => voice.name === getDefaultVoice(language.value, gender)));
    }
  }
  assert.equal(getSpeechLanguage("cy-GB"), undefined);
});

test("plain-text import escapes markup and keeps paragraphs and the chosen voice", () => {
  const source = 'A < B & C > D. "Hello".\r\nAnother line.\r\n\r\nSecond paragraph.';
  const draft = importDraft(source, "text", "An imported script", "en-US", "en-US-GuyNeural");
  const project = projectFromDraft(draft);
  assert.ok(project.document);
  assert.equal(getPrimaryVoice(project.document)?.name, "en-US-GuyNeural");
  assert.equal(project.title, "An imported script");
  assert.ok(draft.ssml.includes("A &lt; B &amp; C &gt; D."));
  const inspection = inspectProject(project);
  assert.equal(inspection.paragraphs, 2);
  assert.ok(inspection.text.includes('A < B & C > D. "Hello".'));
  assert.ok(inspection.text.includes("Another line.\n\nSecond paragraph."));
});

test("SSML import preserves source, unknown voices, and semantic errors for repair", () => {
  const ssml = '<speak version="1.0" xml:lang="cy-GB">\n<voice name="cy-GB-CustomNeural">Helo.</voice>\n</speak>';
  const draft = importDraft(ssml, "ssml", "Welsh script", "ja-JP");
  assert.equal(draft.ssml, ssml);
  const project = projectFromDraft(draft);
  assert.ok(project.document);
  assert.equal(project.document.lang, "cy-GB");
  assert.equal(getPrimaryVoice(project.document)?.name, "cy-GB-CustomNeural");

  const invalidForAzure =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><break time="invalid"/>Hello.</voice></speak>';
  const imported = importDraft(invalidForAzure, "ssml", "Repair me", "en-US");
  assert.equal(imported.ssml, invalidForAzure);
  const inspection = inspectProject(projectFromDraft(imported));
  assert.ok(inspection.diagnostics.some((item) => item.severity === "error"));
  assert.equal(inspection.canSynthesize, false);
});

test("import limits are measured in UTF-8 bytes at the exact boundary", () => {
  const boundary = `${"あ".repeat(Math.floor(MAX_IMPORT_BYTES / 3))}x`;
  assert.equal(new TextEncoder().encode(boundary).byteLength, MAX_IMPORT_BYTES);
  assert.doesNotThrow(() => assertImportSize(boundary));
  assert.throws(() => assertImportSize(`${boundary}x`), /1 MB/);
  assert.doesNotThrow(() => assertImportSize("a".repeat(MAX_IMPORT_BYTES)));
  assert.throws(() => importDraft("a".repeat(MAX_IMPORT_BYTES + 1), "text", "", "en-US"), /1 MB/);
  assert.throws(() => importDraft(" \n\t", "text", "", "en-US"), /empty/);
  assert.throws(() => importDraft("<speak", "ssml", "", "en-US"), /\(\d+:\d+\)/);
  assert.equal(importDraft("Hello", "text", "a".repeat(MAX_TITLE_LENGTH + 1), "en-US").title.length, MAX_TITLE_LENGTH);
});

test("invalid in-progress SSML is retained with exact syntax-error coordinates", () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US">\r\n<voice name="en-US-JennyNeural">\r\nHello</wrong>\r\n</speak>';
  const project = projectFromDraft({ title: "Unfinished", ssml });
  assert.equal(project.ssml, ssml);
  assert.equal(project.document, null);
  const inspection = inspectProject(project);
  const error = validateSsml(ssml);
  assert.ok(error);
  assert.ok(inspection.syntaxError);
  const previousNewline = ssml.lastIndexOf("\n", error.position - 1);
  assert.equal(inspection.syntaxError.line, 3);
  assert.equal(inspection.syntaxError.column, error.position - previousNewline);
  assert.equal(inspection.canSynthesize, false);
  assert.deepEqual(inspection.diagnostics, []);
  assert.equal(inspectProject(projectFromDraft({ title: "", ssml: "<speak/>" })).syntaxError?.column, 1);
});

test("voice and prosody changes preserve the other speakers and existing structure", () => {
  const secondVoice: VoiceElement = {
    type: "voice",
    name: "en-US-GuyNeural",
    children: [{ type: "prosody", rate: "fast", children: ["Second speaker."] }],
  };
  const document: SsmlDocument = {
    version: "1.0",
    lang: "en-US",
    children: [
      {
        type: "voice",
        name: "en-US-JennyNeural",
        effect: "eq_car",
        children: [{ type: "prosody", rate: "slow", pitch: "+2st", children: ["First speaker."] }],
      },
      secondVoice,
    ],
  };
  const original = structuredClone(document);
  assert.equal(inspect(document).text, "First speaker.\n\nSecond speaker.");
  const voiced = updateVoice(document, "ja-JP-NanamiNeural", "ja-JP");
  assert.equal(voiced.lang, "ja-JP");
  assert.equal(getPrimaryVoice(voiced)?.name, "ja-JP-NanamiNeural");
  assert.equal(getPrimaryVoice(voiced)?.effect, "eq_car");
  assert.equal(voiced.children?.[1], secondVoice);
  const tuned = updateProsody(voiced, "volume", "soft");
  assert.equal(getPrimaryProsody(tuned)?.rate, "slow");
  assert.equal(getPrimaryProsody(tuned)?.pitch, "+2st");
  assert.equal(getPrimaryProsody(tuned)?.volume, "soft");
  assert.equal(tuned.children?.[1], secondVoice);
  assert.deepEqual(document, original);
});

test("an empty first voice never borrows settings from a later speaker", () => {
  const document: SsmlDocument = {
    version: "1.0",
    lang: "en-US",
    children: [
      { type: "voice", name: "en-US-JennyNeural" },
      { type: "voice", name: "en-US-GuyNeural", children: [{ type: "prosody", rate: "fast", children: ["Hello"] }] },
    ],
  };
  assert.equal(getPrimaryProsody(document), undefined);
  const tuned = updateProsody(document, "rate", "slow");
  assert.equal(getPrimaryProsody(tuned)?.rate, "slow");
  assert.equal(tuned.children?.[1], document.children?.[1]);
});

test("missing voice/prosody wrappers are inserted without discarding legacy content", () => {
  const legacy: SsmlDocument = { version: "1.0", lang: "en-US", content: "Legacy & text." };
  const voiced = updateVoice(legacy, "en-US-JennyNeural");
  assert.equal(voiced.content, undefined);
  assert.equal(inspect(voiced).text, legacy.content);
  const tuned = updateProsody(voiced, "rate", "slow");
  assert.equal(inspect(tuned).text, legacy.content);
  assert.equal(getPrimaryProsody(tuned)?.rate, "slow");
  assert.deepEqual(getDocumentChildren(legacy), ["Legacy & text."]);
  assert.throws(() => updateVoice(legacy, "  "), /voice name/);
});

test("rewriting keeps primary voice settings but deliberately removes passage formatting", () => {
  let document = createTemplateDocument("Before.\n\nAnother paragraph.", "en-US", "learning");
  document = updateProsody(document, "pitch", "+2st");
  document = updateProsody(document, "volume", "soft");
  document = { ...document, lang: "en-GB", attributes: { "xml:base": "https://example.test/" } };
  const rewritten = rewriteTextDocument(document, "New < text.\n\nNew paragraph.");
  assert.equal(rewritten.lang, "en-GB");
  assert.deepEqual(rewritten.attributes, document.attributes);
  assert.equal(getPrimaryVoice(rewritten)?.name, getPrimaryVoice(document)?.name);
  assert.equal(getPrimaryProsody(rewritten)?.rate, "slow");
  assert.equal(getPrimaryProsody(rewritten)?.pitch, "+2st");
  assert.equal(getPrimaryProsody(rewritten)?.volume, "soft");
  assert.equal(inspect(rewritten).paragraphs, 2);
  assert.ok(inspect(rewritten).text.includes("New < text."));
  assert.equal(buildSsml(rewritten).includes("<break"), false);
  assert.ok(buildSsml(document).includes("<break"));
});

test("duration estimates account for speaking speed, explicit pauses, and empty content", () => {
  const normal = createTextDocument("one two three four five", "en-US");
  assert.equal(inspect(normal).estimatedSeconds, 2);
  assert.equal(inspect(updateProsody(normal, "rate", "slow")).estimatedSeconds, 3);
  assert.equal(inspect(updateProsody(normal, "rate", "2")).estimatedSeconds, 1);
  const paused = parseSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">one two three four five<break time="1500ms"/><break time="2s"/></voice></speak>',
  );
  assert.equal(inspect(paused).estimatedSeconds, 6);
  assert.equal(inspect(createTextDocument("あ".repeat(12), "ja-JP")).estimatedSeconds, 2);
  assert.equal(inspect(createTextDocument("", "en-US")).canSynthesize, false);
  assert.equal(inspect(createTextDocument("", "en-US")).estimatedSeconds, 0);
  assert.equal(getRateMultiplier("+50%"), 1.5);
  assert.equal(getRateMultiplier("-50%"), 0.5);
  assert.equal(getRateMultiplier("x-slow"), 0.6);
  assert.equal(getRateMultiplier("x-fast"), 1.5);
});

test("audio-only documents retain the server's external-source validation policy", () => {
  const document: SsmlDocument = {
    version: "1.0",
    lang: "en-US",
    children: [
      {
        type: "voice",
        name: "en-US-JennyNeural",
        children: [{ type: "audio", src: "https://example.test/audio.mp3" }],
      },
    ],
  };
  assert.equal(inspect(document).characters, 0);
  assert.equal(inspect(document).canSynthesize, false);
  assert.ok(inspect(document).diagnostics.some((item) => item.message.includes("blocked by default")));
});

test("draft snapshots validate their shape without discarding invalid or large edits", () => {
  const snapshot = { version: 1, title: "Saved draft", ssml: "<unfinished", updatedAt: 1234 };
  assert.deepEqual(readDraftSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(projectFromDraft(readDraftSnapshot(JSON.stringify(snapshot))).document, null);
  const larger = { ...snapshot, ssml: "a".repeat(MAX_IMPORT_BYTES + 1) };
  assert.equal(readDraftSnapshot(JSON.stringify(larger)).ssml, larger.ssml);
  for (const value of [
    null,
    {},
    { ...snapshot, version: 2 },
    { ...snapshot, title: 3 },
    { ...snapshot, title: "a".repeat(MAX_TITLE_LENGTH + 1) },
    { ...snapshot, ssml: 3 },
    { ...snapshot, updatedAt: "yesterday" },
    { ...snapshot, updatedAt: null },
  ]) {
    assert.throws(() => readDraftSnapshot(JSON.stringify(value)), /unsupported format/);
  }
  assert.throws(() => readDraftSnapshot("{broken"), SyntaxError);
});

test("captions and downloads retain readable text and use safe output names", () => {
  const document = createTextDocument("Hello --> world.\n\nA & B.", "en-US");
  const source = createCaptionTrack(buildSsml(document));
  assert.ok(source.startsWith("data:text/vtt;charset=utf-8,"));
  const caption = decodeURIComponent(source.slice(source.indexOf(",") + 1));
  assert.ok(caption.startsWith("WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n"));
  assert.ok(caption.includes("Hello -- > world."));
  assert.ok(caption.includes("A & B."));
  assert.equal(downloadName(' ../ My / script:*?" ', "ssml"), "My-script.ssml");
  assert.equal(downloadName("館内 アナウンス", "mp3"), "館内-アナウンス.mp3");
  assert.equal(downloadName("...", "mp3"), "speech.mp3");
  assert.equal(downloadName("a".repeat(MAX_TITLE_LENGTH + 1), "ssml").length, MAX_TITLE_LENGTH + 5);
  assert.throws(() => createCaptionTrack("<broken"), Error);
});
