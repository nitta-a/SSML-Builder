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
import { buildSsml, parseSsml } from "../src/index.ts";

test("buildSsml serializes all supported element attributes", () => {
  const xml = buildSsml({
    version: DEFAULT_SSML_VERSION,
    lang: "ja-JP",
    attributes: { "data-document": 7 },
    children: [
      {
        type: SSML_TAGS.VOICE,
        name: "ja-JP-NanamiNeural",
        effect: "eq_car",
        children: [
          {
            type: SSML_TAGS.PROSODY,
            rate: 120,
            pitch: "+2st",
            volume: -3,
            contour: "(0%,+0st) (100%,+2st)",
            range: "medium",
            children: ["こんにちは"],
          },
          { type: SSML_TAGS.BREAK, time: 500, strength: "weak" },
          {
            type: SSML_TAGS.EXPRESS_AS_CAMEL,
            style: "cheerful",
            styleDegree: 1.5,
            role: "YoungAdultFemale",
            children: ["です。"],
          },
          {
            type: SSML_TAGS.SAY_AS_CAMEL,
            interpretAs: "date",
            format: "ymd",
            detail: "1",
            children: ["2026-08-11"],
          },
          {
            type: SSML_TAGS.PHONEME,
            alphabet: "ipa",
            ph: "konnichiwa",
            children: ["こんにちは"],
          },
          { type: SSML_TAGS.EMPHASIS, level: "strong", children: ["重要"] },
          {
            type: SSML_TAGS.AUDIO,
            src: "https://example.test/intro.wav",
            desc: "intro",
            clipBegin: 0,
            clipEnd: "5s",
            speed: 1.1,
            repeatCount: 2,
            repeatDuration: "10s",
            soundLevel: "-3dB",
          },
          { type: SSML_TAGS.SUB, alias: "World Wide Web", children: ["WWW"] },
          { type: SSML_TAGS.LANG, lang: "en-US", children: ["Hello"] },
          { type: SSML_TAGS.MARK, name: "chapter-1" },
          { type: SSML_TAGS.BOOKMARK, mark: "chapter-1" },
          {
            type: SSML_TAGS.LEXICON,
            uri: "https://example.test/lexicon.pls",
          },
          { type: SSML_TAGS.PARAGRAPH, children: ["paragraph"] },
          { type: SSML_TAGS.SENTENCE, children: ["sentence"] },
          { type: SSML_TAGS.WORD, children: ["word"] },
          {
            type: SSML_TAGS.SILENCE,
            silenceType: "Tailing",
            value: "300ms",
          },
          { type: SSML_TAGS.VISEME, visemeType: "FacialExpression" },
          {
            type: "element",
            name: "custom-tag",
            attributes: { answer: 42 },
            children: [{ type: "text", value: "custom" }],
          },
        ],
      },
    ],
  });

  assert.match(xml, /data-document="7"/);
  assert.match(
    xml,
    new RegExp(`<${SSML_TAGS.VOICE} ${SSML_ATTRS.NAME}="ja-JP-NanamiNeural" ${SSML_ATTRS.EFFECT}="eq_car">`),
  );
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.PROSODY} ${SSML_ATTRS.RATE}="120" ${SSML_ATTRS.PITCH}="\\+2st" ${SSML_ATTRS.VOLUME}="-3" ${SSML_ATTRS.CONTOUR}="\\(0%,\\+0st\\) \\(100%,\\+2st\\)" ${SSML_ATTRS.RANGE}="medium">`,
    ),
  );
  assert.match(xml, new RegExp(`<${SSML_TAGS.BREAK} ${SSML_ATTRS.TIME}="500" ${SSML_ATTRS.STRENGTH}="weak"/>`));
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.MSTTS_EXPRESS_AS} ${SSML_ATTRS.STYLE}="cheerful" ${SSML_ATTRS.STYLE_DEGREE}="1.5" ${SSML_ATTRS.ROLE}="YoungAdultFemale">`,
    ),
  );
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.SAY_AS} ${SSML_ATTRS.INTERPRET_AS}="date" ${SSML_ATTRS.FORMAT}="ymd" ${SSML_ATTRS.DETAIL}="1">2026-08-11</${SSML_TAGS.SAY_AS}>`,
    ),
  );
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.PHONEME} ${SSML_ATTRS.ALPHABET}="ipa" ${SSML_ATTRS.PH}="konnichiwa">こんにちは</${SSML_TAGS.PHONEME}>`,
    ),
  );
  assert.match(xml, new RegExp(`<${SSML_TAGS.EMPHASIS} ${SSML_ATTRS.LEVEL}="strong">重要</${SSML_TAGS.EMPHASIS}>`));
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.AUDIO} ${SSML_ATTRS.SRC}="https:\\/\\/example\\.test\\/intro\\.wav" ${SSML_ATTRS.DESC}="intro" ${SSML_ATTRS.CLIP_BEGIN}="0" ${SSML_ATTRS.CLIP_END}="5s" ${SSML_ATTRS.SPEED}="1\\.1" ${SSML_ATTRS.REPEAT_COUNT}="2" ${SSML_ATTRS.REPEAT_DURATION}="10s" ${SSML_ATTRS.SOUND_LEVEL}="-3dB"/>`,
    ),
  );
  assert.match(xml, new RegExp(`<${SSML_TAGS.SUB} ${SSML_ATTRS.ALIAS}="World Wide Web">WWW</${SSML_TAGS.SUB}>`));
  assert.match(xml, new RegExp(`<${SSML_TAGS.LANG} ${SSML_ATTRS.XML_LANG}="en-US">Hello</${SSML_TAGS.LANG}>`));
  assert.match(xml, new RegExp(`<${SSML_TAGS.MARK} ${SSML_ATTRS.NAME}="chapter-1"/>`));
  assert.match(xml, new RegExp(`<${SSML_TAGS.BOOKMARK} ${SSML_ATTRS.MARK}="chapter-1"/>`));
  assert.match(
    xml,
    new RegExp(`<${SSML_TAGS.LEXICON} ${SSML_ATTRS.URI}="https:\\/\\/example\\.test\\/lexicon\\.pls"/>`),
  );
  assert.match(
    xml,
    new RegExp(
      `<${SSML_TAGS.PARAGRAPH}>paragraph</${SSML_TAGS.PARAGRAPH}><${SSML_TAGS.SENTENCE}>sentence</${SSML_TAGS.SENTENCE}><${SSML_TAGS.WORD}>word</${SSML_TAGS.WORD}>`,
    ),
  );
  assert.match(
    xml,
    new RegExp(`<${SSML_TAGS.MSTTS_SILENCE} ${SSML_ATTRS.TYPE}="Tailing" ${SSML_ATTRS.VALUE}="300ms"/>`),
  );
  assert.match(xml, new RegExp(`<${SSML_TAGS.MSTTS_VISEME} ${SSML_ATTRS.TYPE}="FacialExpression"/>`));
  assert.match(xml, /<custom-tag answer="42">custom<\/custom-tag>/);
  assert.match(xml, new RegExp(`${SSML_ATTRS.MSTTS_XMLNS}="${MSTTS_NAMESPACE}"`));
});

test("buildSsml preserves document metadata and supports legacy content", () => {
  assert.equal(
    buildSsml({
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      content: "Hello",
      attributes: { "data-mode": "legacy" },
    }),
    `<${SSML_TAGS.SPEAK} data-mode="legacy" ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}">Hello</${SSML_TAGS.SPEAK}>`,
  );

  assert.equal(
    buildSsml({
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      children: [],
    }),
    `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}"></${SSML_TAGS.SPEAK}>`,
  );
});

test("buildSsml rejects invalid XML names", () => {
  assert.throws(
    () =>
      buildSsml({
        version: DEFAULT_SSML_VERSION,
        lang: DEFAULT_SSML_LANGUAGE,
        children: [
          {
            type: "custom",
            name: "not valid",
          },
        ],
      }),
    /Invalid XML element name: not valid/,
  );

  assert.throws(
    () =>
      buildSsml({
        version: DEFAULT_SSML_VERSION,
        lang: DEFAULT_SSML_LANGUAGE,
        children: [
          {
            type: "custom",
            name: "custom",
            attributes: { "not valid": "value" },
          },
        ],
      }),
    /Invalid XML attribute name: not valid/,
  );
});

test("parseSsml maps extended SSML elements and decodes character references", () => {
  assert.deepEqual(
    parseSsml(
      `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XMLNS}="${SYNTHESIS_NAMESPACE}" ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}" data-document="7"><${SSML_TAGS.AUDIO} ${SSML_ATTRS.SRC}="https://example.test/a&amp;b.wav"/><${SSML_TAGS.LANG} ${SSML_ATTRS.XML_LANG}="ja-JP">&#x3053;&#12435;&#12395;&#12385;&#12399;</${SSML_TAGS.LANG}><${SSML_TAGS.MSTTS_SILENCE} ${SSML_ATTRS.TYPE}="Leading" ${SSML_ATTRS.VALUE}="300ms"/><${SSML_TAGS.MSTTS_VISEME} ${SSML_ATTRS.TYPE}="redlips_front"/><custom-tag answer="42"/></${SSML_TAGS.SPEAK}>`,
    ),
    {
      type: SSML_TAGS.SPEAK,
      version: DEFAULT_SSML_VERSION,
      lang: DEFAULT_SSML_LANGUAGE,
      attributes: { "data-document": "7" },
      children: [
        {
          type: SSML_TAGS.AUDIO,
          src: "https://example.test/a&b.wav",
        },
        {
          type: SSML_TAGS.LANG,
          lang: "ja-JP",
          children: ["こんにちは"],
        },
        {
          type: SSML_TAGS.MSTTS_SILENCE,
          typeValue: "Leading",
          value: "300ms",
        },
        {
          type: SSML_TAGS.MSTTS_VISEME,
          typeValue: "redlips_front",
        },
        {
          type: "custom",
          name: "custom-tag",
          attributes: { answer: "42" },
        },
      ],
    },
  );
});
