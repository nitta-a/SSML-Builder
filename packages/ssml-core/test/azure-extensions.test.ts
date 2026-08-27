import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSsml,
  getAzureVoiceCatalogMetadata,
  getBuiltInVoiceCatalogMetadata,
  parseSsml,
  validateAzureSsml,
} from "../src/index.ts";

const prefix = '<speak version="1.0" xml:lang="en-US">';
const suffix = "</speak>";

test("parseSsml and buildSsml round-trip Azure dialog extensions as typed nodes", () => {
  const source = `${prefix}<mstts:dialog><mstts:turn voice="en-US-JennyNeural">Hello <mstts:embedding id="speaker-1">there</mstts:embedding></mstts:turn></mstts:dialog><mstts:backgroundaudio src="https://allowed.test/music.mp3" volume="-3dB" fadein="1s" fadeout="500ms"/><mstts:ttsembedding model="custom"/><mstts:voiceconversion profile="speaker-1"/>${suffix}`;
  const document = parseSsml(source);

  assert.equal(document.children?.[0]?.type, "mstts:dialog");
  assert.deepEqual(document.children?.[0], {
    type: "mstts:dialog",
    children: [
      {
        type: "mstts:turn",
        voice: "en-US-JennyNeural",
        children: ["Hello ", { type: "mstts:embedding", attributes: { id: "speaker-1" }, children: ["there"] }],
      },
    ],
  });
  assert.deepEqual(document.children?.[1], {
    type: "mstts:backgroundaudio",
    src: "https://allowed.test/music.mp3",
    volume: "-3dB",
    fadeIn: "1s",
    fadeOut: "500ms",
  });

  assert.deepEqual(parseSsml(buildSsml(document)), document);
});

test("validateAzureSsml validates dialog placement and background audio attributes", () => {
  const diagnostics = validateAzureSsml(
    `${prefix}<mstts:turn>Hello</mstts:turn><mstts:dialog><mstts:turn>World</mstts:turn></mstts:dialog><mstts:backgroundaudio src="http://other.test/music.mp3" volume="too-loud" fadein="soon"/>${suffix}`,
    { allowExternalAudio: false },
  );

  assert.ok(diagnostics.some(({ message }) => message.includes('requires a non-empty "voice"')));
  assert.ok(diagnostics.some(({ message }) => message.includes("only allowed directly inside <mstts:dialog>")));
  assert.ok(diagnostics.some(({ message }) => message.includes("backgroundaudio volume")));
  assert.ok(diagnostics.some(({ message }) => message.includes("backgroundaudio fadein")));
  assert.ok(diagnostics.some(({ message }) => message.includes("must use HTTPS")));
});

test("validateAzureSsml reports tags that are incompatible with a voice feature matrix", () => {
  const diagnostics = validateAzureSsml(
    `${prefix}<voice name="MatrixVoice"><prosody rate="slow">Text</prosody><emphasis level="strong">No</emphasis></voice>${suffix}`,
    {
      unknownVoicePolicy: "ignore",
      voiceDefinitions: [
        {
          name: "MatrixVoice",
          locale: "en-US",
          supportedTags: ["prosody"],
          unsupportedTags: ["emphasis"],
          models: ["neural"],
        },
      ],
    },
  );

  assert.equal(diagnostics.filter(({ code }) => code === "azure-unsupported-tag-for-voice").length, 1);
  assert.equal(
    validateAzureSsml(`${prefix}<voice name="MatrixVoice">Text</voice>${suffix}`, {
      unknownVoicePolicy: "ignore",
      model: "hd",
      voiceDefinitions: [{ name: "MatrixVoice", locale: "en-US", models: ["neural"] }],
    }).find(({ code }) => code === "azure-unsupported-model-for-voice")?.severity,
    "error",
  );
});

test("voice catalog metadata is exposed consistently", () => {
  const metadata = getAzureVoiceCatalogMetadata();
  assert.deepEqual(metadata, getBuiltInVoiceCatalogMetadata());
  assert.ok(metadata.generatedAt);
  assert.ok(metadata.apiVersion);
  assert.equal(Number.isInteger(metadata.voiceCount), true);
});

test("parseSsml keeps unknown custom tags safe and round-trippable", () => {
  const source = `${prefix}<vendor:feature data-id="42"><vendor:child>Text</vendor:child></vendor:feature>${suffix}`;
  const document = parseSsml(source);
  assert.equal(document.children?.[0]?.type, "custom");
  assert.equal((document.children?.[0] as { name?: string } | undefined)?.name, "vendor:feature");
  assert.equal(parseSsml(buildSsml(document)).children?.[0]?.type, "custom");
});
