import assert from "node:assert/strict";
import test from "node:test";
import { createAzureUrlValidatorRunner, splitSsmlDocument, validateAzureSsml } from "../src/index.ts";

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
  assert.equal(chunks[0]?.sourceNodePath?.[0], "speak");
  assert.ok(chunks[0]?.sourceNodePath?.some((part) => part.startsWith("voice[")));
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

test("URL validation deduplicates URLs and respects concurrency", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const runner = createAzureUrlValidatorRunner(
    async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return true;
    },
    { concurrency: 2 },
  );
  await Promise.all([
    runner("https://audio.test/a.mp3", { tag: "audio", attribute: "src" }),
    runner("https://audio.test/a.mp3", { tag: "audio", attribute: "src" }),
    runner("https://audio.test/b.mp3", { tag: "audio", attribute: "src" }),
    runner("https://audio.test/c.mp3", { tag: "audio", attribute: "src" }),
  ]);
  assert.equal(calls, 3);
  assert.equal(maximumActive, 2);
});
