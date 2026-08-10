import assert from "node:assert/strict";
import test from "node:test";
import { AzureTtsClient, synthesizeSpeech } from "../src/index.ts";

test("synthesizeSpeech sends SSML using the supplied configuration", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;

  try {
    globalThis.fetch = async (input, init) => {
      request = { input, init };
      return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
    };

    const audio = await synthesizeSpeech("<speak>Hello</speak>", {
      endpoint: "https://speech.example.test/cognitiveservices/v1",
      subscriptionKey: "subscription-key",
      region: "japaneast",
    });

    assert.equal(
      request?.input,
      "https://speech.example.test/cognitiveservices/v1",
    );
    assert.equal(request?.init?.method, "POST");
    assert.deepEqual(request?.init?.headers, {
      "Ocp-Apim-Subscription-Key": "subscription-key",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    });
    assert.equal(request?.init?.body, "<speak>Hello</speak>");
    assert.deepEqual([...new Uint8Array(audio)], [4, 5, 6]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("synthesize sends SSML to the regional Azure endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;

  try {
    globalThis.fetch = async (input, init) => {
      request = { input, init };
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };

    const audio = await new AzureTtsClient({
      subscriptionKey: "subscription-key",
      region: "japaneast",
    }).synthesize("<speak>Hello</speak>");

    assert.equal(
      request?.input,
      "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1",
    );
    assert.equal(request?.init?.method, "POST");
    assert.deepEqual(request?.init?.headers, {
      "Ocp-Apim-Subscription-Key": "subscription-key",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    });
    assert.equal(request?.init?.body, "<speak>Hello</speak>");
    assert.deepEqual([...new Uint8Array(audio)], [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("synthesize reports unsuccessful Azure responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response("Unauthorized", {
        status: 401,
        statusText: "Unauthorized",
      });

    await assert.rejects(
      new AzureTtsClient({
        subscriptionKey: "subscription-key",
        region: "japaneast",
      }).synthesize("<speak>Hello</speak>"),
      new Error("Azure TTS request failed: 401 Unauthorized"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
