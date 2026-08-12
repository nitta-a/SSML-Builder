import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SSML_LANGUAGE, DEFAULT_SSML_VERSION, SSML_ATTRS, SSML_TAGS } from "../src/constants/ssml.ts";
import { parseSsml, validateSsml } from "../src/index.ts";

const validSpeak = `<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}" ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}">`;
const speakClose = `</${SSML_TAGS.SPEAK}>`;
const mismatchedVoiceMessage = `Mismatched closing element: expected </${SSML_TAGS.VOICE}> but found </${SSML_TAGS.SPEAK}>`;

test("parseSsml accepts XML misc content around the speak element", () => {
  assert.deepEqual(
    parseSsml(
      `\uFEFF <?xml ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}"?><!-- before -->${validSpeak}Hello<!-- after -->${speakClose}<!-- trailing -->`,
    ),
    {
      type: "speak",
      version: "1.0",
      lang: "en-US",
      children: ["Hello"],
    },
  );
});

test("parseSsml decodes named and numeric XML entities", () => {
  assert.deepEqual(parseSsml(`${validSpeak}&quot;A&quot; &#65; &#x1F600; &#9;${speakClose}`).children, ['"A" A 😀 \t']);
});

test("parseSsml reports missing or incorrect document structure", () => {
  assert.throws(() => parseSsml(""), /SSML input is empty at position 0/);
  assert.throws(() => parseSsml("plain text"), /SSML input must start with an XML element at position 0/);
  assert.throws(() => parseSsml("<root/>"), new RegExp(`SSML root element must be <${SSML_TAGS.SPEAK}>, found <root>`));
  assert.throws(
    () => parseSsml(`<${SSML_TAGS.SPEAK} ${SSML_ATTRS.XML_LANG}="${DEFAULT_SSML_LANGUAGE}"/>`),
    new RegExp(`SSML <${SSML_TAGS.SPEAK}> element is missing the "${SSML_ATTRS.VERSION}" attribute`),
  );
  assert.throws(
    () => parseSsml(`<${SSML_TAGS.SPEAK} ${SSML_ATTRS.VERSION}="${DEFAULT_SSML_VERSION}"/>`),
    new RegExp(`SSML <${SSML_TAGS.SPEAK}> element is missing the "${SSML_ATTRS.XML_LANG}" attribute`),
  );
});

test("parseSsml rejects malformed XML constructs", () => {
  const invalidInputs: Array<[string, RegExp]> = [
    [`${validSpeak}<${SSML_TAGS.VOICE}>Hello${speakClose}`, new RegExp(mismatchedVoiceMessage)],
    [`${validSpeak}<${SSML_TAGS.VOICE}>`, new RegExp(`Unclosed XML element: <${SSML_TAGS.VOICE}>`)],
    [`${validSpeak}<${SSML_TAGS.VOICE} value="1" value="2"/>`, /Duplicate XML attribute: value/],
    [`${validSpeak}&unknown;${speakClose}`, /Unknown XML entity: &unknown;/],
    [`${validSpeak}<![CDATA[unclosed${speakClose}`, /Unclosed XML CDATA section/],
    [`${validSpeak}<!-- unclosed${speakClose}`, /Unclosed XML comment/],
    [`<!DOCTYPE ${SSML_TAGS.SPEAK}>${validSpeak}${speakClose}`, /DOCTYPE declarations are not supported/],
  ];

  for (const [input, message] of invalidInputs) {
    assert.throws(() => parseSsml(input), message);
  }
});

test("parseSsml rejects invalid XML character references", () => {
  for (const reference of ["&#0;", "&#xD800;", "&#x110000;"]) {
    assert.throws(() => parseSsml(`${validSpeak}${reference}${speakClose}`), /Invalid XML character reference/);
  }
});

test("parseSsml enforces the supported nesting depth", () => {
  const deeplyNested = `${validSpeak}${"<custom>".repeat(1001)}${speakClose}`;

  assert.throws(() => parseSsml(deeplyNested), /XML nesting depth exceeds the supported limit/);
});

test("validateSsml returns parser messages and positions", () => {
  const source = `${validSpeak}<${SSML_TAGS.VOICE}>Hello${speakClose}`;

  assert.equal(validateSsml(`${validSpeak}Hello${speakClose}`), null);
  assert.deepEqual(validateSsml(source), {
    message: mismatchedVoiceMessage,
    position: source.length,
  });
  assert.deepEqual(validateSsml(`${validSpeak}&unknown;${speakClose}`), {
    message: "Unknown XML entity: &unknown;",
    position: 0,
  });
  assert.deepEqual(validateSsml(42 as unknown as string), {
    message: "SSML input must be a string",
    position: 0,
  });
});
