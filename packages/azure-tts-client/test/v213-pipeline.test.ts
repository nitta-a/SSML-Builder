import assert from "node:assert/strict";
import test from "node:test";
import { mergeSynthesisResults, synthesizeSsmlSafe } from "../src/index.ts";

const audio = (values: number[]): ArrayBuffer => Uint8Array.from(values).buffer;

test("mergeSynthesisResults concatenates audio and offsets synchronization events", () => {
  const result = mergeSynthesisResults([
    {
      audioData: audio([1, 2]),
      durationMs: 100,
      boundaries: [{ text: "one", audioOffsetMs: 20, durationMs: 30, textRange: { start: 0, end: 3 }, requestId: "a" }],
      visemes: [{ visemeId: 1, audioOffsetMs: 40 }],
      bookmarks: [{ name: "first", audioOffsetMs: 50 }],
    },
    {
      audioData: audio([3, 4, 5]),
      durationMs: 250,
      boundaries: [{ text: "two", audioOffsetMs: 10, durationMs: 20, textRange: { start: 3, end: 6 }, requestId: "b" }],
      visemes: [{ visemeId: 2, audioOffsetMs: 15 }],
      bookmarks: [{ name: "second", audioOffsetMs: 25 }],
    },
  ]);

  assert.deepEqual([...new Uint8Array(result.audioData)], [1, 2, 3, 4, 5]);
  assert.equal(result.durationMs, 350);
  assert.deepEqual(
    result.boundaries?.map(({ audioOffsetMs }) => audioOffsetMs),
    [20, 110],
  );
  assert.deepEqual(
    result.visemes?.map(({ audioOffsetMs }) => audioOffsetMs),
    [40, 115],
  );
  assert.deepEqual(
    result.bookmarks?.map(({ audioOffsetMs }) => audioOffsetMs),
    [50, 125],
  );
  assert.deepEqual(result.boundaries?.[1]?.textRange, { start: 3, end: 6 });
  assert.equal(result.boundaries?.[0]?.chunkIndex, 0);
  assert.equal(result.boundaries?.[1]?.chunkIndex, 1);
  assert.equal(result.boundaries?.[1]?.chunkAudioOffsetMs, 10);
  assert.deepEqual(result.boundaries?.[1]?.originalTextRange, { start: 3, end: 6 });
});

test("synthesizeSsmlSafe blocks invalid SSML without calling the client", async () => {
  let calls = 0;
  const result = await synthesizeSsmlSafe(
    {
      synthesizeSsml: async () => {
        calls += 1;
        return { audioData: new ArrayBuffer(0), durationMs: 0 };
      },
    },
    "<speak>",
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "validation-error");
  assert.equal(calls, 0);
});

test("synthesizeSsmlSafe returns a successful result for valid SSML", async () => {
  const expected = { audioData: audio([1]), durationMs: 10 };
  const result = await synthesizeSsmlSafe(
    { synthesizeSsml: async () => expected },
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello</voice></speak>',
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, expected);
});
