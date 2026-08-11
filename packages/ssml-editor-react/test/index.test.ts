import assert from "node:assert/strict";
import test from "node:test";
import { isSsmlEditorButtonVisible, type SsmlEditorButtonVisibility } from "../src/buttonVisibility.ts";
import { formatXml } from "../src/formatXml.ts";
import { SSML_TAG_DEFINITIONS, findSsmlHoverTarget, formatSsmlHover, getSsmlTagDefinition } from "../src/ssmlHover.ts";
import { createSsmlInsertionEdit } from "../src/ssmlInsertion.ts";

test("shows editor buttons by default and hides configured buttons", () => {
  const visibility: SsmlEditorButtonVisibility = {
    rate: false,
    format: true,
  };

  assert.equal(isSsmlEditorButtonVisible(undefined, "help"), true);
  assert.equal(isSsmlEditorButtonVisible(visibility, "rate"), false);
  assert.equal(isSsmlEditorButtonVisible(visibility, "pitch"), true);
  assert.equal(isSsmlEditorButtonVisible(visibility, "format"), true);
  assert.equal(isSsmlEditorButtonVisible({ "mstts:silence": false }, "mstts:silence"), false);
  assert.equal(isSsmlEditorButtonVisible({ customTag: false }, "customTag"), false);
});

test("keeps wrapped insertion tags inline and preserves the selection offset", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello world", 6, 11, {
      prefix: '<prosody rate="slow">',
      suffix: "</prosody>",
      mode: "wrap",
    }),
    {
      replacement: '<prosody rate="slow">world</prosody>',
      selectionOffset: '<prosody rate="slow">'.length,
    },
  );
});

test("places inserted elements on their own lines", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello world", 6, 11, {
      prefix: '<break time="500ms"/>',
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: '\n<break time="500ms"/>\nworld',
      selectionOffset: '\n<break time="500ms"/>\n'.length,
    },
  );
});

test("does not add duplicate line breaks at existing boundaries", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello\nworld", 6, 6, {
      prefix: '<break time="500ms"/>',
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: '<break time="500ms"/>\n',
      selectionOffset: '<break time="500ms"/>'.length,
    },
  );
});

test("defines the supported SSML tags", () => {
  assert.ok(SSML_TAG_DEFINITIONS.length > 0);
  assert.equal(getSsmlTagDefinition("prosody")?.name, "prosody");
  assert.equal(getSsmlTagDefinition("mstts:express-as")?.name, "mstts:express-as");
  assert.equal(getSsmlTagDefinition("express-as")?.name, "mstts:express-as");
});

test("finds a tag name and returns its range", () => {
  const target = findSsmlHoverTarget('<prosody rate="fast">Hello</prosody>', 1, 3);

  assert.equal(target?.kind, "tag");
  assert.equal(target?.tagName, "prosody");
  assert.deepEqual(target?.range, {
    startLineNumber: 1,
    startColumn: 2,
    endLineNumber: 1,
    endColumn: 9,
  });
});

test("finds attributes and quoted attribute values", () => {
  const source = '<prosody rate="fast" pitch="+2st">Hello</prosody>';
  const attribute = findSsmlHoverTarget(source, 1, 11);
  const value = findSsmlHoverTarget(source, 1, 17);

  assert.equal(attribute?.kind, "parameter");
  assert.equal(attribute?.parameter?.name, "rate");
  assert.deepEqual(attribute?.range, {
    startLineNumber: 1,
    startColumn: 10,
    endLineNumber: 1,
    endColumn: 14,
  });
  assert.equal(value?.kind, "parameter-value");
  assert.equal(value?.parameter?.name, "rate");
  assert.deepEqual(value?.range, {
    startLineNumber: 1,
    startColumn: 16,
    endLineNumber: 1,
    endColumn: 20,
  });
});

test("supports namespaced tags, hyphenated attributes, and closing tags", () => {
  const source = '<mstts:express-as style-degree="1.5">Hello</mstts:express-as>';
  const tag = findSsmlHoverTarget(source, 1, 5);
  const parameter = findSsmlHoverTarget(source, 1, 24);
  const closingTag = findSsmlHoverTarget(source, 1, 48);

  assert.equal(tag?.definition.name, "mstts:express-as");
  assert.equal(parameter?.parameter?.name, "styledegree");
  assert.equal(closingTag?.kind, "tag");
  assert.equal(closingTag?.isClosingTag, true);
});

test("supports multiline and incomplete start tags", () => {
  const source = '<prosody\n  rate="fa';
  const tag = findSsmlHoverTarget(source, 1, 4);
  const attribute = findSsmlHoverTarget(source, 2, 4);
  const value = findSsmlHoverTarget(source, 2, 10);

  assert.equal(tag?.tagName, "prosody");
  assert.equal(attribute?.parameter?.name, "rate");
  assert.equal(value?.kind, "parameter-value");
});

test("does not provide help for unknown tags, attributes, or text", () => {
  assert.equal(findSsmlHoverTarget('<custom answer="42">text</custom>', 1, 3), undefined);
  assert.equal(findSsmlHoverTarget('<prosody unknown="42">text</prosody>', 1, 11), undefined);
  assert.equal(findSsmlHoverTarget("<prosody>text</prosody>", 1, 11), undefined);
});

test("formats tag and parameter documentation as safe markdown", () => {
  const tag = findSsmlHoverTarget('<break strength="strong"/>', 1, 3);
  const parameter = findSsmlHoverTarget('<break strength="strong"/>', 1, 10);

  assert.ok(tag);
  assert.ok(parameter);
  assert.match(formatSsmlHover(tag), /Inserts a pause/);
  assert.match(formatSsmlHover(tag), /`strength`/);
  assert.match(formatSsmlHover(parameter), /\*\*Parameter `strength`\*\*/);
  assert.match(formatSsmlHover(parameter), /`strong`/);
  assert.doesNotMatch(formatSsmlHover(tag), /<script>/i);
});

test("formats nested XML with readable line breaks", () => {
  assert.equal(
    formatXml(
      '<speak version="1.0"><voice name="Jenny"><prosody rate="slow">Hello</prosody><break time="500ms"/></voice></speak>',
    ),
    '<speak version="1.0">\n  <voice name="Jenny">\n    <prosody rate="slow">Hello</prosody>\n    <break time="500ms"/>\n  </voice>\n</speak>',
  );
});

test("puts text-only SSML content on a readable line", () => {
  assert.equal(
    formatXml('<speak version="1.0" xml:lang="en-US">Welcome to the Builder .</speak>'),
    '<speak version="1.0" xml:lang="en-US">\n  Welcome to the Builder .\n</speak>',
  );
});

test("keeps formatted XML stable and handles empty input", () => {
  const formatted = "<root>\n  <child>text</child>\n</root>";

  assert.equal(formatXml(formatted), formatted);
  assert.equal(formatXml(" \n\t "), "");
});
