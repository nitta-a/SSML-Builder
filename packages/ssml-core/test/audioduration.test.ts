import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml, isValidAzureAudioDuration, parseSsml, validateAzureSsml } from "../src/index.ts";

const prefix = '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">';
const suffix = "</voice></speak>";

test("parseSsml preserves mstts:audioduration as a typed element", () => {
  const document = parseSsml(`${prefix}<mstts:audioduration value="00:00:10.500"/>${suffix}`);
  assert.deepEqual(document.children?.[0], {
    type: "voice",
    name: "en-US-JennyNeural",
    children: [{ type: "mstts:audioduration", value: "00:00:10.500" }],
  });
});

test("buildSsml serializes mstts:audioduration and adds the namespace", () => {
  const document = parseSsml(`${prefix}<mstts:audioduration value="10s"/>${suffix}`);
  assert.equal(
    buildSsml(document),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts"><voice name="en-US-JennyNeural"><mstts:audioduration value="10s"/></voice></speak>',
  );
});

test("validateAzureSsml accepts supported audio duration formats", () => {
  for (const value of ["10s", "5000ms", "00:00:10", "00:00:10.500", "100:59:59.999"]) {
    assert.equal(isValidAzureAudioDuration(value), true, value);
    assert.deepEqual(validateAzureSsml(`${prefix}<mstts:audioduration value="${value}"/>${suffix}`), [], value);
  }
});

test("validateAzureSsml rejects invalid audio duration values and non-self-closing tags", () => {
  for (const value of ["0s", "-1s", "10", "10m", "00:60:00", "00:00:60", "00:00:00.0000", ""]) {
    assert.equal(isValidAzureAudioDuration(value), false, value);
    assert.equal(
      validateAzureSsml(`${prefix}<mstts:audioduration value="${value}"/>${suffix}`).length > 0,
      true,
      value,
    );
  }
  const diagnostics = validateAzureSsml(
    `${prefix}<mstts:audioduration value="10s">ignored</mstts:audioduration>${suffix}`,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.message.includes("self-closing")),
    true,
  );
});
