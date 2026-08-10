import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, parseSsml, validateSsml } from "../src/index.ts";

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
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">Hello &amp; <voice name="en-US-JennyNeural"><prosody rate="slow" pitch="+2st">world</prosody><break time="500ms"/><mstts:express-as style="cheerful">!</mstts:express-as></voice></speak>',
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
          children: ["Say <this> & that"],
        },
      ],
    }),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="voice &amp; &quot;name&quot;">Say &lt;this&gt; &amp; that</voice></speak>',
  );
});

test("parseSsml converts nested XML into an SSML document", () => {
  assert.deepEqual(
    parseSsml(
      '<?xml version="1.0"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts"><voice name="en-US-JennyNeural" data-source="test">Hello &amp; <prosody rate="slow" pitch="+2st">world</prosody><break time="500ms"/><mstts:express-as style="cheerful">!</mstts:express-as></voice></speak>',
    ),
    {
      type: "speak",
      version: "1.0",
      lang: "en-US",
      children: [
        {
          type: "voice",
          name: "en-US-JennyNeural",
          attributes: { "data-source": "test" },
          children: [
            "Hello & ",
            {
              type: "prosody",
              rate: "slow",
              pitch: "+2st",
              children: ["world"],
            },
            { type: "break", time: "500ms" },
            {
              type: "mstts:express-as",
              style: "cheerful",
              children: ["!"],
            },
          ],
        },
      ],
    },
  );
});

test("parseSsml decodes text, CDATA, and custom elements", () => {
  assert.deepEqual(
    parseSsml(
      '<speak version="1.0" xml:lang="ja-JP">A &lt; B<!-- ignored --><![CDATA[ &amp; C ]]><custom-tag answer="42">D</custom-tag></speak>',
    ),
    {
      type: "speak",
      version: "1.0",
      lang: "ja-JP",
      children: [
        "A < B &amp; C ",
        {
          type: "custom",
          name: "custom-tag",
          attributes: { answer: "42" },
          children: ["D"],
        },
      ],
    },
  );
});

test("validateSsml returns no error for valid SSML", () => {
  assert.equal(
    validateSsml('<speak version="1.0" xml:lang="en-US">Hello</speak>'),
    null,
  );
});

test("validateSsml returns a message and parser position for invalid SSML", () => {
  const source = '<speak version="1.0" xml:lang="en-US"><voice>Hello</speak>';
  const error = validateSsml(source);

  assert.deepEqual(error, {
    message: "Mismatched closing element: expected </voice> but found </speak>",
    position: source.length,
  });
});
