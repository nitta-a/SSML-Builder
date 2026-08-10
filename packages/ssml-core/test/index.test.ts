import assert from "node:assert/strict";
import test from "node:test";
import { buildSsml } from "../src/index.ts";

test("buildSsml uses the default language", () => {
  assert.deepEqual(buildSsml("Hello"), {
    version: "1.0",
    lang: "en-US",
    content: "Hello",
  });
});

test("buildSsml accepts a custom language and content", () => {
  assert.deepEqual(buildSsml("こんにちは", "ja-JP"), {
    version: "1.0",
    lang: "ja-JP",
    content: "こんにちは",
  });
});
