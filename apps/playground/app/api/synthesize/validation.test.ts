import assert from "node:assert/strict";
import test from "node:test";
import { containsVoiceTag } from "./validation.ts";

test("containsVoiceTag detects nested voice elements", () => {
  assert.equal(
    containsVoiceTag([
      {
        type: "prosody",
        children: [{ type: "voice", name: "en-US-JennyNeural", children: ["Hello"] }],
      },
    ]),
    true,
  );
});

test("containsVoiceTag rejects documents without voice elements", () => {
  assert.equal(containsVoiceTag(["Hello", { type: "break", time: "500ms" }]), false);
});
