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
  const contexts: Array<{ parentTag: string; path: string[] }> = [];
  const mapped = await mapSsmlTextNodes(source, async (text, context) => {
    contexts.push(context);
    return text.trim() ? `[${text}]` : text;
  });

  assert.equal(
    mapped,
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">[Hello ]<phoneme alphabet="ipa" ph="həˈləʊ">[world]</phoneme><break time="500ms"/>[!]</voice></speak>',
  );
  assert.deepEqual(contexts, [
    { parentTag: "voice", path: ["speak", "voice"] },
    { parentTag: "phoneme", path: ["speak", "voice", "phoneme"] },
    { parentTag: "voice", path: ["speak", "voice"] },
  ]);
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
