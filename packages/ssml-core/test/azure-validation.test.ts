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
