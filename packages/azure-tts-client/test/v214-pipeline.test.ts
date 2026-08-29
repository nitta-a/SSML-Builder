import assert from "node:assert/strict";
import test from "node:test";
import {
  ChunkValidationError,
  UnsupportedMergeFormatError,
  mergeAudioBuffers,
  synthesizeSsmlChunksSafe,
} from "../src/index.ts";

function wav(data: number[], sampleRate = 16_000): ArrayBuffer {
  const pcm = Uint8Array.from(data);
  const output = new Uint8Array(44 + pcm.length + (pcm.length & 1));
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
  view.setUint32(40, pcm.length, true);
  output.set(pcm, 44);
  return output.buffer;
}

const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">${text}</voice></speak>`;

test("mergeAudioBuffers rebuilds one valid WAV header", () => {
  const merged = mergeAudioBuffers([wav([1, 2]), wav([3, 4, 5])], { format: "riff-16khz-16bit-mono-pcm" });
  const bytes = new Uint8Array(merged);
  const view = new DataView(merged);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.equal(view.getUint32(4, true), merged.byteLength - 8);
  assert.equal(view.getUint32(40, true), 5);
  assert.deepEqual([...bytes.slice(44, 49)], [1, 2, 3, 4, 5]);
  assert.equal(bytes[49], 0);
});

test("mergeAudioBuffers removes per-buffer ID3 tags from MP3 streams", () => {
  const tag = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  const first = new Uint8Array(tag.length + 2);
  first.set(tag);
  first.set([1, 2], tag.length);
  const second = new Uint8Array(tag.length + 1);
  second.set(tag);
  second[tag.length] = 3;
  assert.deepEqual(
    [
      ...new Uint8Array(
        mergeAudioBuffers([first.buffer, second.buffer], { format: "audio-16khz-128kbitrate-mono-mp3" }),
      ),
    ],
    [1, 2, 3],
  );
});

test("mergeAudioBuffers rejects container formats that require remultiplexing", () => {
  assert.throws(
    () => mergeAudioBuffers([new ArrayBuffer(1)], { format: "webm-24khz-16bit-mono-opus" }),
    (error: unknown) => error instanceof UnsupportedMergeFormatError,
  );
});

test("synthesizeSsmlChunksSafe validates all chunks before calling Azure", async () => {
  let calls = 0;
  const progress: string[] = [];
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => {
        calls += 1;
        return { audioData: new ArrayBuffer(0), durationMs: 0 };
      },
    },
    [validSsml("ok"), "<speak>"],
    { onProgress: (event) => progress.push(`${event.chunkIndex}:${event.status}`) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "validation-error");
  if (!result.ok) {
    assert.ok(result.error instanceof ChunkValidationError);
    assert.equal(result.error.chunkIndex, 1);
  }
  assert.equal(calls, 0);
  assert.deepEqual(progress, ["0:pending", "1:pending", "1:failed"]);
});

test("synthesizeSsmlChunksSafe reports structured lifecycle progress", async () => {
  const progress: Array<{ chunkIndex: number; status: string; durationMs: number }> = [];
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => ({ audioData: Uint8Array.of(1).buffer, durationMs: 20 }),
    },
    [
      { ssml: validSsml("one"), originalTextRange: { start: 0, end: 3 }, sourceNodePath: ["speak", "voice[0]"] },
      { ssml: validSsml("two"), originalTextRange: { start: 3, end: 6 }, sourceNodePath: ["speak", "voice[0]"] },
    ],
    {
      onProgress: (event) =>
        progress.push({ chunkIndex: event.chunkIndex, status: event.status, durationMs: event.durationMs }),
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    progress.map(({ chunkIndex, status }) => `${chunkIndex}:${status}`),
    ["0:pending", "1:pending", "0:synthesizing", "0:success", "1:synthesizing", "1:success"],
  );
  assert.ok(progress.every(({ durationMs }) => durationMs >= 0));
});
