import assert from "node:assert/strict";
import test from "node:test";
import { parseSsml, validateSsml } from "../src/index.ts";

const validSpeak = '<speak version="1.0" xml:lang="en-US">';

test("parseSsml accepts XML misc content around the speak element", () => {
  assert.deepEqual(
    parseSsml(
      `\uFEFF <?xml version="1.0"?><!-- before -->${validSpeak}Hello<!-- after --></speak><!-- trailing -->`,
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
  assert.deepEqual(
    parseSsml(`${validSpeak}&quot;A&quot; &#65; &#x1F600; &#9;</speak>`)
      .children,
    ['"A" A 😀 \t'],
  );
});

test("parseSsml reports missing or incorrect document structure", () => {
  assert.throws(() => parseSsml(""), /SSML input is empty at position 0/);
  assert.throws(
    () => parseSsml("plain text"),
    /SSML input must start with an XML element at position 0/,
  );
  assert.throws(
    () => parseSsml("<root/>"),
    /SSML root element must be <speak>, found <root>/,
  );
  assert.throws(
    () => parseSsml('<speak xml:lang="en-US"/>'),
    /SSML <speak> element is missing the "version" attribute/,
  );
  assert.throws(
    () => parseSsml('<speak version="1.0"/>'),
    /SSML <speak> element is missing the "xml:lang" attribute/,
  );
});

test("parseSsml rejects malformed XML constructs", () => {
  const invalidInputs: Array<[string, RegExp]> = [
    [
      `${validSpeak}<voice>Hello</speak>`,
      /Mismatched closing element: expected <\/voice> but found <\/speak>/,
    ],
    [`${validSpeak}<voice>`, /Unclosed XML element: <voice>/],
    [
      `${validSpeak}<voice value="1" value="2"/>`,
      /Duplicate XML attribute: value/,
    ],
    [`${validSpeak}&unknown;</speak>`, /Unknown XML entity: &unknown;/],
    [`${validSpeak}<![CDATA[unclosed</speak>`, /Unclosed XML CDATA section/],
    [`${validSpeak}<!-- unclosed</speak>`, /Unclosed XML comment/],
    [
      `<!DOCTYPE speak>${validSpeak}</speak>`,
      /DOCTYPE declarations are not supported/,
    ],
  ];

  for (const [input, message] of invalidInputs) {
    assert.throws(() => parseSsml(input), message);
  }
});

test("parseSsml rejects invalid XML character references", () => {
  for (const reference of ["&#0;", "&#xD800;", "&#x110000;"]) {
    assert.throws(
      () => parseSsml(`${validSpeak}${reference}</speak>`),
      /Invalid XML character reference/,
    );
  }
});

test("parseSsml enforces the supported nesting depth", () => {
  const deeplyNested = `${validSpeak}${"<custom>".repeat(1001)}</speak>`;

  assert.throws(
    () => parseSsml(deeplyNested),
    /XML nesting depth exceeds the supported limit/,
  );
});

test("validateSsml returns parser messages and positions", () => {
  const source = `${validSpeak}<voice>Hello</speak>`;

  assert.equal(validateSsml(`${validSpeak}Hello</speak>`), null);
  assert.deepEqual(validateSsml(source), {
    message: "Mismatched closing element: expected </voice> but found </speak>",
    position: source.length,
  });
  assert.deepEqual(validateSsml(`${validSpeak}&unknown;</speak>`), {
    message: "Unknown XML entity: &unknown;",
    position: 0,
  });
  assert.deepEqual(validateSsml(42 as unknown as string), {
    message: "SSML input must be a string",
    position: 0,
  });
});
