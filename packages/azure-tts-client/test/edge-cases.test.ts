import assert from "node:assert/strict";
import test from "node:test";
import { AzureTtsClient, synthesizeSpeech } from "../src/index.ts";

test("synthesizeSpeech replaces every endpoint region placeholder", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: RequestInfo | URL | undefined;
  const audio = new ArrayBuffer(1);

  globalThis.fetch = async (input) => {
    requestUrl = input;
    return {
      ok: true,
      arrayBuffer: async () => audio,
    } as Response;
  };

  try {
    const result = await synthesizeSpeech("<speak>Hello</speak>", {
      endpoint: "https://{region}.example.test/{region}",
      subscriptionKey: "subscription-key",
      region: "japan east",
    });

    assert.equal(requestUrl, "https://japan%20east.example.test/japan%20east");
    assert.strictEqual(result, audio);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AzureTtsClient propagates network failures", async () => {
  const originalFetch = globalThis.fetch;
  const networkError = new Error("network unavailable");

  globalThis.fetch = async () => {
    throw networkError;
  };

  try {
    await assert.rejects(
      new AzureTtsClient({
        endpoint: "https://speech.example.test/cognitiveservices/v1",
        subscriptionKey: "subscription-key",
        region: "japaneast",
      }).synthesize("<speak>Hello</speak>"),
      networkError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
