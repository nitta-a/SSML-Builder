import assert from "node:assert/strict";
import test from "node:test";
import {
  SSML_TAG_DEFINITIONS,
  findSsmlHoverTarget,
  formatSsmlHover,
  getSsmlTagDefinition,
} from "../src/ssmlHover.ts";

test("defines the supported SSML tags", () => {
  assert.ok(SSML_TAG_DEFINITIONS.length > 0);
  assert.equal(getSsmlTagDefinition("prosody")?.name, "prosody");
  assert.equal(getSsmlTagDefinition("mstts:express-as")?.name, "mstts:express-as");
  assert.equal(getSsmlTagDefinition("express-as")?.name, "mstts:express-as");
});

test("finds a tag name and returns its range", () => {
  const target = findSsmlHoverTarget(
    '<prosody rate="fast">Hello</prosody>',
    1,
    3,
  );

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
    startColumn: 11,
    endLineNumber: 1,
    endColumn: 15,
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
  const source =
    '<mstts:express-as style-degree="1.5">Hello</mstts:express-as>';
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
  assert.equal(findSsmlHoverTarget("<custom answer=\"42\">text</custom>", 1, 3), undefined);
  assert.equal(findSsmlHoverTarget('<prosody unknown="42">text</prosody>', 1, 11), undefined);
  assert.equal(findSsmlHoverTarget("<prosody>text</prosody>", 1, 11), undefined);
});

test("formats tag and parameter documentation as safe markdown", () => {
  const tag = findSsmlHoverTarget("<break strength=\"strong\"/>", 1, 3);
  const parameter = findSsmlHoverTarget("<break strength=\"strong\"/>", 1, 10);

  assert.ok(tag);
  assert.ok(parameter);
  assert.match(formatSsmlHover(tag), /Inserts a pause/);
  assert.match(formatSsmlHover(tag), /`strength`/);
  assert.match(formatSsmlHover(parameter), /\*\*Parameter `strength`\*\*/);
  assert.match(formatSsmlHover(parameter), /`strong`/);
  assert.doesNotMatch(formatSsmlHover(tag), /<script>/);
});
