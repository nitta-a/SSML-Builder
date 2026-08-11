import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, parseSsml } from "../src/index.ts";

test("buildSsml serializes all supported element attributes", () => {
  const xml = buildSsml({
    version: "1.0",
    lang: "ja-JP",
    attributes: { "data-document": 7 },
    children: [
      {
        type: "voice",
        name: "ja-JP-NanamiNeural",
        effect: "eq_car",
        children: [
          {
            type: "prosody",
            rate: 120,
            pitch: "+2st",
            volume: -3,
            contour: "(0%,+0st) (100%,+2st)",
            range: "medium",
            children: ["こんにちは"],
          },
          { type: "break", time: 500, strength: "weak" },
          {
            type: "expressAs",
            style: "cheerful",
            styleDegree: 1.5,
            role: "YoungAdultFemale",
            children: ["です。"],
          },
          {
            type: "sayAs",
            interpretAs: "date",
            format: "ymd",
            detail: "1",
            children: ["2026-08-11"],
          },
          {
            type: "phoneme",
            alphabet: "ipa",
            ph: "konnichiwa",
            children: ["こんにちは"],
          },
          { type: "emphasis", level: "strong", children: ["重要"] },
          {
            type: "audio",
            src: "https://example.test/intro.wav",
            desc: "intro",
            clipBegin: 0,
            clipEnd: "5s",
            speed: 1.1,
            repeatCount: 2,
            repeatDuration: "10s",
            soundLevel: "-3dB",
          },
          { type: "sub", alias: "World Wide Web", children: ["WWW"] },
          { type: "lang", lang: "en-US", children: ["Hello"] },
          { type: "mark", name: "chapter-1" },
          { type: "bookmark", mark: "chapter-1" },
          {
            type: "lexicon",
            uri: "https://example.test/lexicon.pls",
          },
          { type: "p", children: ["paragraph"] },
          { type: "s", children: ["sentence"] },
          { type: "w", children: ["word"] },
          {
            type: "silence",
            silenceType: "Tailing",
            value: "300ms",
          },
          { type: "viseme", visemeType: "FacialExpression" },
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
  assert.match(xml, /<voice name="ja-JP-NanamiNeural" effect="eq_car">/);
  assert.match(
    xml,
    /<prosody rate="120" pitch="\+2st" volume="-3" contour="\(0%,\+0st\) \(100%,\+2st\)" range="medium">/,
  );
  assert.match(xml, /<break time="500" strength="weak"\/>/);
  assert.match(
    xml,
    /<mstts:express-as style="cheerful" styledegree="1.5" role="YoungAdultFemale">/,
  );
  assert.match(
    xml,
    /<say-as interpret-as="date" format="ymd" detail="1">2026-08-11<\/say-as>/,
  );
  assert.match(
    xml,
    /<phoneme alphabet="ipa" ph="konnichiwa">こんにちは<\/phoneme>/,
  );
  assert.match(xml, /<emphasis level="strong">重要<\/emphasis>/);
  assert.match(
    xml,
    /<audio src="https:\/\/example\.test\/intro\.wav" desc="intro" clipBegin="0" clipEnd="5s" speed="1\.1" repeatCount="2" repeatDuration="10s" soundLevel="-3dB"\/>/,
  );
  assert.match(xml, /<sub alias="World Wide Web">WWW<\/sub>/);
  assert.match(xml, /<lang xml:lang="en-US">Hello<\/lang>/);
  assert.match(xml, /<mark name="chapter-1"\/>/);
  assert.match(xml, /<bookmark mark="chapter-1"\/>/);
  assert.match(xml, /<lexicon uri="https:\/\/example\.test\/lexicon\.pls"\/>/);
  assert.match(xml, /<p>paragraph<\/p><s>sentence<\/s><w>word<\/w>/);
  assert.match(xml, /<mstts:silence type="Tailing" value="300ms"\/>/);
  assert.match(xml, /<mstts:viseme type="FacialExpression"\/>/);
  assert.match(xml, /<custom-tag answer="42">custom<\/custom-tag>/);
  assert.match(xml, /xmlns:mstts="http:\/\/www\.w3\.org\/2001\/mstts"/);
});

test("buildSsml preserves document metadata and supports legacy content", () => {
  assert.equal(
    buildSsml({
      version: "1.0",
      lang: "en-US",
      content: "Hello",
      attributes: { "data-mode": "legacy" },
    }),
    '<speak data-mode="legacy" version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">Hello</speak>',
  );

  assert.equal(
    buildSsml({
      version: "1.0",
      lang: "en-US",
      children: [],
    }),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"></speak>',
  );
});

test("buildSsml rejects invalid XML names", () => {
  assert.throws(
    () =>
      buildSsml({
        version: "1.0",
        lang: "en-US",
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
        version: "1.0",
        lang: "en-US",
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
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US" data-document="7"><audio src="https://example.test/a&amp;b.wav"/><lang xml:lang="ja-JP">&#x3053;&#12435;&#12395;&#12385;&#12399;</lang><mstts:silence type="Leading" value="300ms"/><mstts:viseme type="redlips_front"/><custom-tag answer="42"/></speak>',
    ),
    {
      type: "speak",
      version: "1.0",
      lang: "en-US",
      attributes: { "data-document": "7" },
      children: [
        {
          type: "audio",
          src: "https://example.test/a&b.wav",
        },
        {
          type: "lang",
          lang: "ja-JP",
          children: ["こんにちは"],
        },
        {
          type: "mstts:silence",
          typeValue: "Leading",
          value: "300ms",
        },
        {
          type: "mstts:viseme",
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
