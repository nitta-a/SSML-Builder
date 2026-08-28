import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, parseSsml, validateAzureSsml } from "../src/index.ts";
import type { SsmlDocument } from "../src/index.ts";

const base = {
  type: "speak",
  version: "1.0",
  lang: "en-US",
} as const;

function assertAzureRoundTrip(document: SsmlDocument, options: Parameters<typeof validateAzureSsml>[1] = {}): void {
  const xml = buildSsml(document);
  assert.deepEqual(parseSsml(xml), document);
  assert.deepEqual(validateAzureSsml(xml, { unknownVoicePolicy: "ignore", ...options }), []);
}

test("Azure backgroundaudio sample round-trips and allows a configured origin", () => {
  const document: SsmlDocument = {
    ...base,
    children: [
      {
        type: "mstts:backgroundaudio",
        src: "https://allowed.test/music.mp3",
        volume: "40",
        fadeIn: "0",
        fadeOut: "10000",
      },
      { type: "voice", name: "en-US-JennyNeural", children: ["Welcome."] },
    ],
  };

  assertAzureRoundTrip(document, {
    allowExternalAudio: false,
    allowedAudioOrigins: ["https://allowed.test/"],
  });
});

test("Azure dialog turn speaker sample round-trips", () => {
  assertAzureRoundTrip({
    ...base,
    children: [
      {
        type: "voice",
        name: "en-US-MultiTalker-Ava-Andrew:DragonHDLatestNeural",
        children: [
          {
            type: "mstts:dialog",
            children: [
              { type: "mstts:turn", speaker: "ava", children: ["Hello, Andrew!"] },
              { type: "mstts:turn", speaker: "andrew", children: ["Hey Ava!"] },
            ],
          },
        ],
      },
    ],
  });
});

test("Azure number_digit sample round-trips", () => {
  assertAzureRoundTrip({
    ...base,
    children: [
      {
        type: "voice",
        name: "en-US-JennyNeural",
        children: [{ type: "say-as", interpretAs: "number_digit", children: ["12345"] }],
      },
    ],
  });
});

test('Azure prosody rate="1.5" sample round-trips', () => {
  assertAzureRoundTrip({
    ...base,
    children: [
      {
        type: "voice",
        name: "en-US-JennyNeural",
        children: [{ type: "prosody", rate: "1.5", children: ["Faster speech."] }],
      },
    ],
  });
});

test("Azure ttsembedding sample round-trips its speakerProfileId", () => {
  assertAzureRoundTrip({
    ...base,
    children: [
      {
        type: "voice",
        name: "PhoenixV2Neural",
        children: [{ type: "mstts:ttsembedding", speakerProfileId: "speaker-profile-id", children: ["Hello."] }],
      },
    ],
  });
});

test("Azure backgroundaudio enforces its range, position, and singleton rules", () => {
  const invalid = `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Text</voice><mstts:backgroundaudio src="https://allowed.test/a.mp3" volume="101" fadein="10001ms"/><mstts:backgroundaudio src="https://allowed.test/b.mp3" volume="0" fadeout="0s"/></speak>`;
  const diagnostics = validateAzureSsml(invalid, {
    allowedAudioOrigins: ["https://allowed.test"],
    unknownVoicePolicy: "ignore",
  });
  assert.ok(diagnostics.some(({ message }) => message.includes("volume")));
  assert.ok(diagnostics.some(({ message }) => message.includes("fadein")));
  assert.ok(diagnostics.some(({ message }) => message.includes("first element directly under <speak>")));
  assert.ok(diagnostics.some(({ message }) => message.includes("at most one")));

  const unitSuffixed = validateAzureSsml(
    `<speak version="1.0" xml:lang="en-US"><mstts:backgroundaudio src="https://allowed.test/a.mp3" fadein="1s"/><voice name="en-US-JennyNeural">Text</voice></speak>`,
    { allowedAudioOrigins: ["https://allowed.test"], unknownVoicePolicy: "ignore" },
  );
  assert.ok(unitSuffixed.some(({ message }) => message.includes("between 0 and 10000 milliseconds")));
});
