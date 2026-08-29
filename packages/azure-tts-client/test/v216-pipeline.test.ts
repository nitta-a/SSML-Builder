import assert from "node:assert/strict";
import test from "node:test";
import {
  AudioFormatMismatchError,
  AzureTtsError,
  mergeAudioBuffers,
  mergeSynthesisResults,
  synthesizeSsmlChunksSafe,
} from "../src/index.ts";

const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">${text}</voice></speak>`;

function wav(data: number[], sampleRate: number): ArrayBuffer {
  const output = new Uint8Array(44 + data.length + (data.length & 1));
  const view = new DataView(output.buffer);
  output.set(new TextEncoder().encode("RIFF"), 0);
  output.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(4, output.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  output.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, data.length, true);
  output.set(data, 44);
  return output.buffer;
}

test("chunk merging rejects incompatible WAV sample rates", () => {
  assert.throws(
    () => mergeAudioBuffers([wav([1, 2], 16_000), wav([3, 4], 24_000)], { format: "riff-16khz-16bit-mono-pcm" }),
    (error: unknown) => error instanceof AudioFormatMismatchError,
  );
});

test("safe chunk synthesis retries transient errors and preserves chunk order", async () => {
  let attempts = 0;
  let oneAttempts = 0;
  let active = 0;
  let maximumActive = 0;
  const completed: string[] = [];
  const retryEvents: number[] = [];
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async (ssml) => {
        attempts += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, ssml.includes("one") ? 5 : 1));
        active -= 1;
        if (ssml.includes("one")) {
          oneAttempts += 1;
          if (oneAttempts < 3) throw new AzureTtsError(503, "Unavailable", "", null);
        }
        completed.push(ssml.includes("one") ? "one" : "two");
        return { audioData: Uint8Array.of(ssml.includes("one") ? 1 : 2).buffer, durationMs: 10 };
      },
    },
    [validSsml("one"), validSsml("two")],
    {
      concurrency: 2,
      retryOptions: { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0 },
      onProgress: (event) => {
        if (event.isRetrying && event.retryAttempt) retryEvents.push(event.retryAttempt);
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(maximumActive, 2);
  assert.deepEqual(retryEvents, [1, 2]);
  assert.equal(attempts, 4);
  if (result.ok) assert.deepEqual([...new Uint8Array(result.value.audioData)], [1, 2]);
});

test("safe chunk synthesis does not retry permanent HTTP errors", async () => {
  let calls = 0;
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => {
        calls += 1;
        throw new AzureTtsError(400, "Bad Request", "", null);
      },
    },
    [validSsml("bad")],
    { retryOptions: { maxRetries: 3, initialDelayMs: 0, maxDelayMs: 0 } },
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test("custom mergers receive input specifications and cancellation", async () => {
  const controller = new AbortController();
  let received: { format: string; inputSpecs: unknown[]; signal: AbortSignal } | undefined;
  const result = await mergeSynthesisResults([{ audioData: Uint8Array.of(1).buffer, durationMs: 1 }], {
    format: "webm-24khz-16bit-mono-opus",
    signal: controller.signal,
    customMerger: (buffers, context) => {
      received = { format: context.format, inputSpecs: context.inputSpecs, signal: context.signal };
      return buffers[0] ?? new ArrayBuffer(0);
    },
  });
  assert.equal(result.mimeType, "audio/webm");
  assert.equal(received?.format, "webm-24khz-16bit-mono-opus");
  assert.equal(received?.inputSpecs.length, 1);
  assert.equal(received?.signal, controller.signal);
});
