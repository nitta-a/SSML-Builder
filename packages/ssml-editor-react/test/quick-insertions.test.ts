import assert from "node:assert/strict";
import test from "node:test";
import {
  createQuickInsertionTemplate,
  QUICK_INSERTION_DEFINITIONS,
  type QuickInsertionDefinition,
} from "../src/quickInsertions.ts";

function getDefinition(id: QuickInsertionDefinition["id"]): QuickInsertionDefinition {
  const definition = QUICK_INSERTION_DEFINITIONS.find((candidate) => candidate.id === id);
  assert.ok(definition);
  return definition;
}

test("requires explicit attributes for quick insertions", () => {
  assert.equal(createQuickInsertionTemplate(getDefinition("prosody"), {}), null);
  assert.equal(
    createQuickInsertionTemplate(getDefinition("express-as"), { style: "cheerful" })?.prefix,
    '<mstts:express-as style="cheerful">',
  );
});

test("supports selecting an emphasis level", () => {
  assert.deepEqual(createQuickInsertionTemplate(getDefinition("emphasis"), { level: "strong" }), {
    prefix: '<emphasis level="strong">',
    suffix: "</emphasis>",
    mode: "wrap",
  });
});

test("supports multiple selected prosody attributes and escapes values", () => {
  const template = createQuickInsertionTemplate(getDefinition("prosody"), {
    pitch: '+2st" & bright',
    rate: "fast",
  });

  assert.deepEqual(template, {
    prefix: '<prosody rate="fast" pitch="+2st&quot; &amp; bright">',
    suffix: "</prosody>",
    mode: "wrap",
  });
});

test("requires one break attribute", () => {
  const definition = getDefinition("break");

  assert.equal(createQuickInsertionTemplate(definition, { time: "500ms", strength: "strong" }), null);
  assert.deepEqual(createQuickInsertionTemplate(definition, { time: "1s" }), {
    prefix: '<break time="1s"/>',
    suffix: "",
    mode: "insert",
  });
});
