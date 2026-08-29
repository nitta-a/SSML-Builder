import assert from "node:assert/strict";
import test from "node:test";
import {
  AzureTtsError,
  BatchChunkValidationError,
  getRetryAfterDelayMs,
  synthesizeSsmlChunksSafe,
} from "../src/index.ts";

const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">${text}</voice></speak>`;

test("aggregates every invalid chunk and every diagnostic before synthesis", async () => {
  let calls = 0;
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => {
        calls += 1;
        return { audioData: new ArrayBuffer(0), durationMs: 0 };
      },
    },
    ["<speak>", "<speak>", validSsml("ok")],
  );

  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  if (!result.ok) {
    assert.ok(result.error instanceof BatchChunkValidationError);
    assert.deepEqual(
      result.error.chunkDiagnostics.map(({ chunkIndex }) => chunkIndex),
      [0, 1],
    );
    assert.equal(result.error.totalErrorCount, 2);
  }
});

test("custom merger and post-merge validation are part of safe chunk synthesis", async () => {
  let validated = false;
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async (ssml) => ({
        audioData: Uint8Array.of(ssml.includes("one") ? 1 : 2).buffer,
        durationMs: 10,
      }),
    },
    [validSsml("one"), validSsml("two")],
    {
      concurrency: 2,
      outputMimeType: "audio/custom",
      customMerger: (buffers) => {
        const output = new Uint8Array(buffers.reduce((total, buffer) => total + buffer.byteLength, 0));
        let offset = 0;
        for (const buffer of buffers) {
          output.set(new Uint8Array(buffer), offset);
          offset += buffer.byteLength;
        }
        return output.buffer;
      },
      postMergeValidator: (merged) => {
        validated = merged.mimeType === "audio/custom";
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(validated, true);
  if (result.ok) assert.equal(result.value.mimeType, "audio/custom");
});

test("cancels remaining work and resumes from the partial chunk cache", async () => {
  let calls = 0;
  let failFirstAttempt = true;
  const client = {
    synthesizeSsml: async (ssml: string, options?: { signal?: AbortSignal }) => {
      calls += 1;
      if (ssml.includes("fail") && failFirstAttempt) {
        failFirstAttempt = false;
        throw new AzureTtsError(503, "Unavailable", "", null);
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ssml.includes("one") ? 1 : 50);
        options?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
      return { audioData: Uint8Array.of(calls).buffer, durationMs: 10 };
    },
  };
  const chunks = [validSsml("one"), validSsml("fail"), validSsml("three")];
  const first = await synthesizeSsmlChunksSafe(client, chunks, { concurrency: 2 });
  assert.equal(first.ok, false);
  assert.ok(first.partialResult);
  if (!first.ok && first.partialResult) {
    const resumed = await synthesizeSsmlChunksSafe(client, chunks, {
      concurrency: 2,
      resumeChunks: first.partialResult.synthesizedChunks,
      resumeChunkIndices: first.partialResult.pendingChunkIndices,
    });
    assert.equal(resumed.ok, true);
  }
  assert.ok(calls < 6);
});

test("prioritizes Retry-After and supports structured per-chunk timeouts", async () => {
  const retryAfter = new AzureTtsError(429, "Too Many Requests", "", null, { "retry-after": "2" });
  assert.equal(getRetryAfterDelayMs(retryAfter), 2_000);

  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async (_ssml, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
        ),
    },
    [validSsml("slow")],
    { timeouts: { perChunkMs: 5 } },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "timeout");
});
