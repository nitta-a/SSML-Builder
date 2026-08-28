import assert from "node:assert/strict";
import test from "node:test";
import { splitSsmlDocument, validateAzureSsml } from "../src/index.ts";

test("splitSsmlDocument returns source metadata and applies background audio policy", () => {
  const ssml = `<speak version="1.0" xml:lang="en-US"><mstts:backgroundaudio src="https://audio.test/music.mp3"/><voice name="en-US-JennyNeural"><prosody rate="slow"><p>One <mark name="first"/>two.</p><p>Three four five. ${"three ".repeat(30)}</p></prosody></voice></speak>`;
  const plainText = `One two.Three four five. ${"three ".repeat(30)}`;
  const chunks = splitSsmlDocument(ssml, 300);

  assert.ok(chunks.length > 1);
  assert.equal(chunks[0]?.chunkIndex, 0);
  assert.equal(chunks[0]?.hasBackgroundAudio, true);
  assert.ok(chunks.slice(1).every((chunk) => chunk.hasBackgroundAudio === false));
  assert.deepEqual(chunks[0]?.containedMarks, ["first"]);
  assert.equal(chunks[0]?.inheritedContext.voice, "en-US-JennyNeural");
  assert.equal(chunks[0]?.inheritedContext.prosody?.rate, "slow");
  assert.deepEqual(chunks.at(-1)?.originalTextRange, {
    start: chunks
      .slice(0, -1)
      .reduce((total, chunk) => total + chunk.originalTextRange.end - chunk.originalTextRange.start, 0),
    end: plainText.length,
  });

  const replicated = splitSsmlDocument(ssml, 300, { replicateBackgroundAudio: true });
  assert.ok(replicated.every((chunk) => chunk.hasBackgroundAudio));
});

test("validateAzureSsml awaits custom URL validators and reports their reason", async () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><audio src="https://private.test/a.mp3"/></voice></speak>';
  const contexts: Array<{ tag: string; attribute: string }> = [];
  const diagnostics = await validateAzureSsml(ssml, {
    allowExternalAudio: true,
    urlValidator: async (url, context) => {
      contexts.push(context);
      return { valid: !url.includes("private"), reason: "private network address" };
    },
  });

  assert.deepEqual(contexts, [{ tag: "audio", attribute: "src" }]);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("private network address")));
});
