import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SSML_LANGUAGE,
  DEFAULT_SSML_VERSION,
  MSTTS_NAMESPACE,
  SSML_ATTRS,
  SSML_TAGS,
  SYNTHESIS_NAMESPACE,
} from "../src/constants/ssml.ts";
import { buildPartialSsml, buildSsml, parseSsml, validateSsml } from "../src/index.ts";

function speakDocument(body: string, lang = DEFAULT_SSML_LANGUAGE, includeMsttsNamespace = false): string {
  const msttsNamespace = includeMsttsNamespace ? ` ${SSML_ATTRS.MSTTS_XMLNS}="${MSTTS_NAMESPACE}"` : "";
  return `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${lang}"${msttsNamespace}>${body}</${SSML_TAGS.SPEAK}>`;
}

const mismatchedVoiceMessage = `Mismatched closing element: expected </${SSML_TAGS.VOICE}> but found </${SSML_TAGS.SPEAK}>`;

test("buildPartialSsml creates a minimal playable document", () => {
  assert.equal(buildPartialSsml("Hello", { lang: DEFAULT_SSML_LANGUAGE }), speakDocument("Hello"));
});

test("buildPartialSsml preserves voice and prosody context", () => {
  assert.equal(
    buildPartialSsml({
      text: "こんにちは",
      lang: "ja-JP",
      voiceName: "ja-JP-NanamiNeural",
      prosody: { rate: "slow", pitch: "+2st" },
    }),
    speakDocument(
      `<${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="ja-JP-NanamiNeural"><${SSML_TAGS.PROSODY} ${SSML_ATTRS.RATE}="slow" ${SSML_ATTRS.PITCH}="+2st">こんにちは</${SSML_TAGS.PROSODY}></${SSML_TAGS.VOICE}>`,
      "ja-JP",
    ),
  );
});

test("buildPartialSsml parses valid XML fragments and escapes invalid fragments", () => {
  assert.equal(
    buildPartialSsml(`<${SSML_TAGS.BREAK} ${SSML_ATTRS.TIME}="300ms"/>Hello`, {
      lang: DEFAULT_SSML_LANGUAGE,
      voice: "en-US-JennyNeural",
    }),
    speakDocument(
      `<${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="en-US-JennyNeural"><${SSML_TAGS.BREAK} ${SSML_ATTRS.TIME}="300ms"/>Hello</${SSML_TAGS.VOICE}>`,
    ),
  );
  assert.equal(buildPartialSsml("1 < 2", { lang: DEFAULT_SSML_LANGUAGE }), speakDocument("1 &lt; 2"));
});

test("buildPartialSsml accepts a voice shorthand in object options", () => {
  assert.equal(
    buildPartialSsml({
      text: "Hello",
      lang: DEFAULT_SSML_LANGUAGE,
      voice: "en-US-JennyNeural",
    }),
    speakDocument(`<${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="en-US-JennyNeural">Hello</${SSML_TAGS.VOICE}>`),
  );
});

test("buildSsml uses the default language", () => {
  assert.deepEqual(buildSsml("Hello"), {
    version: DEFAULT_SSML_VERSION,
    lang: DEFAULT_SSML_LANGUAGE,
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
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      children: [
        "Hello & ",
        {
          type: SSML_TAGS.VOICE,
          name: "en-US-JennyNeural",
          children: [
            {
              type: SSML_TAGS.PROSODY,
              rate: "slow",
              pitch: "+2st",
              children: ["world"],
            },
            { type: SSML_TAGS.BREAK, time: "500ms" },
            {
              type: SSML_TAGS.EXPRESS_AS,
              style: "cheerful",
              children: ["!"],
            },
          ],
        },
      ],
    }),
    speakDocument(
      `Hello &amp; <${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="en-US-JennyNeural"><${SSML_TAGS.PROSODY} ${SSML_ATTRS.RATE}="slow" ${SSML_ATTRS.PITCH}="+2st">world</${SSML_TAGS.PROSODY}><${SSML_TAGS.BREAK} ${SSML_ATTRS.TIME}="500ms"/><${SSML_TAGS.MSTTS_EXPRESS_AS} ${SSML_ATTRS.STYLE}="cheerful">!</${SSML_TAGS.MSTTS_EXPRESS_AS}></${SSML_TAGS.VOICE}>`,
      DEFAULT_SSML_LANGUAGE,
      true,
    ),
  );
});

test("buildSsml escapes text and attribute values", () => {
  assert.equal(
    buildSsml({
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      children: [
        {
          type: SSML_TAGS.VOICE,
          name: 'voice & "name"',
          children: ["Say <this> & that"],
        },
      ],
    }),
    speakDocument(
      `<${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="voice &amp; &quot;name&quot;">Say &lt;this&gt; &amp; that</${SSML_TAGS.VOICE}>`,
    ),
  );
});

test("parseSsml converts nested XML into an SSML document", () => {
  assert.deepEqual(
    parseSsml(
      `<?xml ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}"?><${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}" ${SSML_ATTRS.MSTTS_XMLNS}="${MSTTS_NAMESPACE}"><${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="en-US-JennyNeural" data-source="test">Hello &amp; <${SSML_TAGS.PROSODY} ${SSML_ATTRS.RATE}="slow" ${SSML_ATTRS.PITCH}="+2st">world</${SSML_TAGS.PROSODY}><${SSML_TAGS.BREAK} ${SSML_ATTRS.TIME}="500ms"/><${SSML_TAGS.MSTTS_EXPRESS_AS} ${SSML_ATTRS.STYLE}="cheerful">!</${SSML_TAGS.MSTTS_EXPRESS_AS}></${SSML_TAGS.VOICE}></${SSML_TAGS.SPEAK}>`,
    ),
    {
      type: SSML_TAGS.SPEAK,
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      children: [
        {
          type: SSML_TAGS.VOICE,
          name: "en-US-JennyNeural",
          attributes: { "data-source": "test" },
          children: [
            "Hello & ",
            {
              type: SSML_TAGS.PROSODY,
              rate: "slow",
              pitch: "+2st",
              children: ["world"],
            },
            { type: SSML_TAGS.BREAK, time: "500ms" },
            {
              type: SSML_TAGS.MSTTS_EXPRESS_AS,
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
      `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XML_LANG}="ja-JP">A &lt; B<!-- ignored --><![CDATA[ &amp; C ]]><custom-tag answer="42">D</custom-tag></${SSML_TAGS.SPEAK}>`,
    ),
    {
      type: SSML_TAGS.SPEAK,
      version: DEFAULT_SSML_VERSION,
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
  assert.equal(validateSsml(speakDocument("Hello")), null);
});

test("validateSsml returns a message and parser position for invalid SSML", () => {
  const source = speakDocument(`<${SSML_TAGS.VOICE}>Hello`);
  const error = validateSsml(source);

  assert.deepEqual(error, {
    message: mismatchedVoiceMessage,
    position: source.length,
  });
});
