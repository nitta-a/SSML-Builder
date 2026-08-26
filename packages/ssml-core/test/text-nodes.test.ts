import assert from "node:assert/strict";
import test from "node:test";
import { extractSsmlText, mapSsmlTextNodes } from "../src/index.ts";

const source =
  '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello <phoneme alphabet="ipa" ph="həˈləʊ">world</phoneme><break time="500ms"/>!</voice></speak>';

test("extractSsmlText returns text nodes in document order", () => {
  assert.deepEqual(extractSsmlText(source), ["Hello ", "world", "!"]);
  assert.deepEqual(extractSsmlText('<speak version="1.0" xml:lang="en-US"><voice name="x">A &amp; B</voice></speak>'), [
    "A & B",
  ]);
});

test("mapSsmlTextNodes preserves XML and supplies parent context", async () => {
  const contexts: Array<{
    ancestorTags: string[];
    parentAttributes: Record<string, string>;
    parentTag: string;
    path: string[];
  }> = [];
  const mapped = await mapSsmlTextNodes(
    source,
    async (text, context) => {
      contexts.push(context);
      return text.trim() ? `[${text}]` : text;
    },
    { skipTags: [] },
  );

  assert.equal(
    mapped,
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">[Hello ]<phoneme alphabet="ipa" ph="həˈləʊ">[world]</phoneme><break time="500ms"/>[!]</voice></speak>',
  );
  assert.deepEqual(contexts, [
    {
      ancestorTags: ["speak"],
      parentAttributes: { name: "en-US-JennyNeural" },
      parentTag: "voice",
      path: ["speak", "voice"],
    },
    {
      ancestorTags: ["speak", "voice"],
      parentAttributes: { alphabet: "ipa", ph: "həˈləʊ" },
      parentTag: "phoneme",
      path: ["speak", "voice", "phoneme"],
    },
    {
      ancestorTags: ["speak"],
      parentAttributes: { name: "en-US-JennyNeural" },
      parentTag: "voice",
      path: ["speak", "voice"],
    },
  ]);
});

test("mapSsmlTextNodes skips pronunciation tags and supports context filters", async () => {
  const seen: string[] = [];
  const mapped = await mapSsmlTextNodes(
    '<speak version="1.0" xml:lang="en-US"><voice name="custom"><phoneme alphabet="ipa" ph="x">skip</phoneme><say-as interpret-as="characters">also skip</say-as><sub alias="replacement">skip too</sub><prosody rate="slow">translate</prosody></voice></speak>',
    (text, context) => {
      seen.push(`${context.parentTag}:${text}`);
      return text.toUpperCase();
    },
    { filter: (context) => context.parentTag !== "prosody" },
  );

  assert.equal(
    mapped,
    '<speak version="1.0" xml:lang="en-US"><voice name="custom"><phoneme alphabet="ipa" ph="x">skip</phoneme><say-as interpret-as="characters">also skip</say-as><sub alias="replacement">skip too</sub><prosody rate="slow">translate</prosody></voice></speak>',
  );
  assert.deepEqual(seen, []);

  const filtered = await mapSsmlTextNodes(
    '<speak version="1.0" xml:lang="en-US"><voice name="custom"><prosody rate="slow">translate</prosody>plain</voice></speak>',
    (text) => text.toUpperCase(),
    { skipTags: [], filter: (context) => context.parentTag === "voice" || context.ancestorTags.includes("voice") },
  );
  assert.equal(
    filtered,
    '<speak version="1.0" xml:lang="en-US"><voice name="custom"><prosody rate="slow">TRANSLATE</prosody>PLAIN</voice></speak>',
  );
});

test("mapSsmlTextNodes handles CDATA text without exposing markup", async () => {
  const sourceWithCdata =
    '<speak version="1.0" xml:lang="en-US"><voice name="x"><![CDATA[Hello <world>]]></voice></speak>';
  assert.deepEqual(extractSsmlText(sourceWithCdata), ["Hello <world>"]);
  assert.equal(
    await mapSsmlTextNodes(sourceWithCdata, (text) => text.replace("Hello", "こんにちは")),
    '<speak version="1.0" xml:lang="en-US"><voice name="x">こんにちは &lt;world&gt;</voice></speak>',
  );
});
