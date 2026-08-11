import assert from "node:assert/strict";
import test from "node:test";
import { formatXml } from "../src/formatXml.ts";

test("formatXml keeps declarations, comments, and CDATA at the current depth", () => {
  assert.equal(
    formatXml(
      '<?xml version="1.0"?><speak><!-- comment --><voice>text</voice><![CDATA[raw <xml>]]></speak>',
    ),
    '<?xml version="1.0"?>\n<speak>\n  <!-- comment -->\n  <voice>text</voice>\n  <![CDATA[raw <xml>]]>\n</speak>',
  );
});

test("formatXml handles inline text and self-closing siblings", () => {
  assert.equal(
    formatXml(" \n<root>Hello<item>world</item><empty />!</root>\n "),
    "<root>Hello<item>world</item>\n<empty />!</root>",
  );
});

test("formatXml preserves attribute contents containing angle brackets", () => {
  assert.equal(
    formatXml('<root><item name="first > second" value="second"/></root>'),
    '<root>\n  <item name="first > second" value="second"/>\n</root>',
  );
});
