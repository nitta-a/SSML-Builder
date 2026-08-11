import assert from "node:assert/strict";
import test from "node:test";
import { formatXml } from "../src/formatXml.ts";

test("formatXml keeps declarations, comments, and CDATA at the current depth", () => {
  assert.equal(
    formatXml('<?xml version="1.0"?><speak><!-- comment --><voice>text</voice><![CDATA[raw <xml>]]></speak>'),
    '<?xml version="1.0"?>\n<speak>\n  <!-- comment -->\n  <voice>text</voice>\n  <![CDATA[raw <xml>]]>\n</speak>',
  );
});

test("formatXml handles inline text and self-closing siblings", () => {
  assert.equal(
    formatXml(" \n<root>Hello<item>world</item><empty />!</root>\n "),
    "<root>Hello<item>world</item><empty />!</root>",
  );
});

test("formatXml preserves attribute contents containing angle brackets", () => {
  assert.equal(
    formatXml('<root><item name="first > second" value="second"/></root>'),
    '<root>\n  <item name="first > second" value="second"/>\n</root>',
  );
});

test("formatXml preserves namespaces, entities, and mixed-content whitespace", () => {
  const source =
    '<speak xml:lang="en-US" xmlns:mstts="https://example.test/mstts"><voice name="first > second" data="&amp; &quot;">left <break time="500ms"/> right &amp; text</voice></speak>';

  assert.equal(
    formatXml(source),
    '<speak xml:lang="en-US" xmlns:mstts="https://example.test/mstts">\n  <voice name="first > second" data="&amp; &quot;">left <break time="500ms"/> right &amp; text</voice>\n</speak>',
  );
});

test("formatXml returns malformed input unchanged", () => {
  const malformed = " \n<root><child></root> \n";
  const incomplete = '<root attribute="unterminated>';

  assert.equal(formatXml(malformed), malformed);
  assert.equal(formatXml(incomplete), incomplete);
  assert.equal(formatXml("<root>&unknown;</root>"), "<root>&unknown;</root>");
  assert.equal(formatXml("<root/><second/>"), "<root/><second/>");
});

test("formatXml removes formatting whitespace and remains idempotent", () => {
  const source =
    ' \n<?xml version="1.0"?>\n<speak>\n  <!-- comment --> \n  <voice><![CDATA[raw <xml>]]></voice>\n  <break time="500ms"/>\n</speak>\n ';
  const formatted = formatXml(source);

  assert.equal(
    formatted,
    '<?xml version="1.0"?>\n<speak>\n  <!-- comment -->\n  <voice>\n    <![CDATA[raw <xml>]]>\n  </voice>\n  <break time="500ms"/>\n</speak>',
  );
  assert.equal(formatXml(formatted), formatted);
});

test("formatXml formats empty elements as a stable block", () => {
  const formatted = formatXml("<root><empty></empty></root>");

  assert.equal(formatted, "<root>\n  <empty>\n  </empty>\n</root>");
  assert.equal(formatXml(formatted), formatted);
});
