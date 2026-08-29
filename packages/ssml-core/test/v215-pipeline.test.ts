import assert from "node:assert/strict";
import test from "node:test";
import { createAzureUrlValidatorRunner, getSsmlSourceMap } from "../src/index.ts";

test("getSsmlSourceMap maps text segments and markers to indexed source paths", () => {
  const map = getSsmlSourceMap(
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">A <prosody rate="slow">B</prosody><bookmark mark="chapter"/>C</voice></speak>',
  );

  assert.equal(map.text, "A BC");
  assert.deepEqual(
    map.segments.map((segment) => segment.range),
    [
      { start: 0, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 4 },
    ],
  );
  assert.deepEqual(map.segments[1]?.sourceNodePath, ["speak", "voice[0]", "prosody[1]"]);
  assert.deepEqual(map.markers, [
    {
      kind: "bookmark",
      name: "chapter",
      originalTextRange: { start: 3, end: 3 },
      sourceNodePath: ["speak", "voice[0]", "bookmark[2]"],
    },
  ]);
});

test("URL validation passes an abort signal and keys cache entries by tag and attribute", async () => {
  const cache = new Map<string, boolean>();
  let calls = 0;
  let receivedSignal: AbortSignal | undefined;
  const runner = createAzureUrlValidatorRunner(
    async (_url, _context, signal) => {
      calls += 1;
      receivedSignal = signal;
      return true;
    },
    { cache },
  );

  await runner("https://example.test/a", { tag: "audio", attribute: "src" }, new AbortController().signal);
  await runner("https://example.test/a", { tag: "audio", attribute: "src" }, new AbortController().signal);
  await runner("https://example.test/a", { tag: "lexicon", attribute: "uri" }, new AbortController().signal);
  assert.equal(calls, 2);
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.deepEqual([...cache.keys()], ["audio:src:https://example.test/a", "lexicon:uri:https://example.test/a"]);
});
