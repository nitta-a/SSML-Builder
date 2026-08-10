import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml } from "../src/index.ts";

test("buildSsml uses the default language", () => {
  assert.deepEqual(buildSsml("Hello"), {
    version: "1.0",
    lang: "en-US",
    content: "Hello",
  });
});

test("buildSsml accepts a custom language and content", () => {
  assert.deepEqual(buildSsml("こんにちは", "ja-JP"), {
    version: "1.0",
    lang: "ja-JP",
    content: "こんにちは",
  });
});

test("buildSsml serializes nested SSML elements", () => {
  assert.equal(
    buildSsml({
      version: "1.0",
      lang: "en-US",
      children: [
        "Hello & ",
        {
          type: "voice",
          name: "en-US-JennyNeural",
          children: [
            {
              type: "prosody",
              rate: "slow",
              pitch: "+2st",
              children: ["world"],
            },
            { type: "break", time: "500ms" },
            {
              type: "express-as",
              style: "cheerful",
              children: ["!"],
            },
          ],
        },
      ],
    }),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US" xmlns:mstts="https://www.w3.org/2001/mstts">Hello &amp; <voice name="en-US-JennyNeural"><prosody rate="slow" pitch="+2st">world</prosody><break time="500ms"/><mstts:express-as style="cheerful">!</mstts:express-as></voice></speak>',
  );
});

test("buildSsml escapes text and attribute values", () => {
  assert.equal(
    buildSsml({
      version: "1.0",
      lang: "en-US",
      children: [
        {
          type: "voice",
          name: 'voice & "name"',
          children: ['Say <this> & that'],
        },
      ],
    }),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="voice &amp; &quot;name&quot;">Say &lt;this&gt; &amp; that</voice></speak>',
  );
});
