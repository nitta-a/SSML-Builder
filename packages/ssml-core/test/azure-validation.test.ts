import assert from "node:assert/strict";
import test from "node:test";
import { validateAzureSsml } from "../src/index.ts";

const valid =
  '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><mstts:express-as style="cheerful">Hello</mstts:express-as></voice></speak>';

test("validateAzureSsml accepts a valid Azure document", () => {
  assert.deepEqual(validateAzureSsml(valid), []);
});

test("validateAzureSsml reports semantic requirements with locations", () => {
  const diagnostics = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><prosody rate="invalid">Hello</prosody></speak>',
  );
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("requires at least one <voice>")));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("prosody rate")));
  assert.ok(
    diagnostics.every(
      (diagnostic) => diagnostic.line >= 1 && diagnostic.column >= 1 && diagnostic.severity === "error",
    ),
  );
});

test("validateAzureSsml checks voice styles, length, and audio origins", () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><mstts:express-as style="angry">Hello</mstts:express-as><audio src="https://example.test/audio.mp3"/></voice></speak>';
  const diagnostics = validateAzureSsml(ssml, { allowedAudioOrigins: ["https://allowed.test"], maxLength: 10 });
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("maximum length")));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("not supported by voice")));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("origin")));
});

test("validateAzureSsml accepts custom voice styles and reports unknown metadata by policy", () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><voice name="CustomVoice"><mstts:express-as style="custom-style">Hello</mstts:express-as></voice></speak>';

  assert.deepEqual(
    validateAzureSsml(ssml, {
      customVoiceStyleMap: { CustomVoice: ["custom-style"] },
      unknownVoicePolicy: "error",
    }),
    [],
  );

  const diagnostics = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="UnknownVoice"><mstts:express-as style="unknown-style">Hello</mstts:express-as></voice></speak>',
    { unknownVoicePolicy: "error" },
  );
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("Unknown voice")));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("Unknown style")));
  assert.ok(
    diagnostics
      .filter((diagnostic) => diagnostic.message.includes("Unknown"))
      .every((diagnostic) => diagnostic.severity === "error"),
  );

  const warnings = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="UnknownVoice">Hello</voice></speak>',
  );
  assert.ok(
    warnings.some((diagnostic) => diagnostic.message.includes("Unknown voice") && diagnostic.severity === "warning"),
  );
  assert.equal(
    validateAzureSsml('<speak version="1.0" xml:lang="en-US"><voice name="UnknownVoice">Hello</voice></speak>', {
      unknownVoicePolicy: "ignore",
    }).length,
    0,
  );
});

test("validateAzureSsml reports voice and language mismatches", () => {
  const diagnostics = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="ja-JP-NanamiNeural">こんにちは</voice></speak>',
  );

  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.message.includes('Voice "ja-JP-NanamiNeural"') &&
        diagnostic.message.includes('language "en-US"') &&
        diagnostic.severity === "warning",
    ),
  );
});

test("validateAzureSsml prefers a voice xml:lang over the speak language", () => {
  const matching = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="ja-JP-NanamiNeural" xml:lang="ja-JP">こんにちは</voice></speak>',
  );
  assert.equal(
    matching.some((diagnostic) => diagnostic.message.includes("does not match language")),
    false,
  );

  const mismatching = validateAzureSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="ja-JP-NanamiNeural" xml:lang="fr-FR">Bonjour</voice></speak>',
  );
  assert.ok(mismatching.some((diagnostic) => diagnostic.message.includes('language "fr-FR"')));
});

test("validateAzureSsml validates nested voices independently and protects external audio by default", () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">One<voice name="CustomVoice"><mstts:express-as style="custom">Two</mstts:express-as></voice></voice><audio src="https://example.test/audio.mp3"/></speak>';
  const diagnostics = validateAzureSsml(ssml, {
    customVoiceStyleMap: { CustomVoice: ["custom"] },
  });

  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("external origin")));
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.message.includes("Unknown voice")).length, 0);
  assert.deepEqual(
    validateAzureSsml(ssml, {
      allowExternalAudio: true,
      customVoiceStyleMap: { CustomVoice: ["custom"] },
    }).filter((diagnostic) => diagnostic.message.includes("audio")),
    [],
  );
});
