import assert from "node:assert/strict";
import test from "node:test";
import { AzureTtsError, inspectAudioSpecification, synthesizeSsmlChunksSafe } from "../src/index.ts";

const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><prosody rate="+5%" pitch="+2st">${text}</prosody></voice></speak>`;

test("invalidates a resume chunk when its SSML fingerprint changes", async () => {
  let calls = 0;
  let failSecondChunk = true;
  const client = {
    synthesizeSsml: async (ssml: string) => {
      calls += 1;
      if (ssml.includes("two") && failSecondChunk) {
        failSecondChunk = false;
        throw new Error("temporary failure");
      }
      return { audioData: Uint8Array.of(calls).buffer, durationMs: 1 };
    },
  };
  const first = await synthesizeSsmlChunksSafe(client, [validSsml("one"), validSsml("two")], {
    concurrency: 1,
  });
  assert.equal(first.ok, false);
  assert.ok(first.partialResult);
  if (first.ok || !first.partialResult) return;

  const resumed = await synthesizeSsmlChunksSafe(client, [validSsml("changed"), validSsml("two")], {
    concurrency: 1,
    resumeChunks: first.partialResult.synthesizedChunks,
    resumeChunkIndices: first.partialResult.pendingChunkIndices,
  });
  assert.equal(resumed.ok, true);
  assert.equal(calls, 4);
  assert.match(first.partialResult.synthesizedChunks[0]?.fingerprint ?? "", /^fnv1a64-/);
});

test("separates the original failure from chained cancellations", async () => {
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => {
        throw new Error("direct failure");
      },
    },
    [validSsml("fail"), validSsml("cancelled")],
    { concurrency: 1 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.partialResult?.failedChunkIndices, [0]);
    assert.deepEqual(result.partialResult?.cancelledChunkIndices, [1]);
    assert.equal(result.partialResult?.chunkStates[0]?.status, "failed");
    assert.equal(result.partialResult?.chunkStates[0]?.isOriginalFailure, true);
    assert.equal(result.partialResult?.chunkStates[1]?.status, "cancelled");
    assert.equal(result.partialResult?.chunkStates[1]?.isOriginalFailure, false);
  }
});

test("does not wait for Retry-After beyond the retry budget", async () => {
  let calls = 0;
  const startedAt = Date.now();
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => {
        calls += 1;
        throw new AzureTtsError(429, "Too Many Requests", "", null, { "retry-after": "10" });
      },
    },
    [validSsml("retry")],
    { retryOptions: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5 } },
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.ok(Date.now() - startedAt < 100);
  if (!result.ok) assert.equal(result.error.kind, "timeout");
});

test("maps headerless RAW formats to strict codec specifications", () => {
  const mulaw = inspectAudioSpecification(new ArrayBuffer(8), "raw-8khz-8bit-mono-mulaw");
  assert.deepEqual(
    {
      sampleRate: mulaw.sampleRate,
      channels: mulaw.channels,
      bitDepth: mulaw.bitDepth,
      codec: mulaw.codec,
      mimeType: mulaw.mimeType,
    },
    { sampleRate: 8_000, channels: 1, bitDepth: 8, codec: "mulaw", mimeType: "audio/basic" },
  );
  assert.throws(() => inspectAudioSpecification(new ArrayBuffer(1), "raw-16khz-16bit-mono-pcm"));
});
