import assert from "node:assert/strict";
import test from "node:test";
import { AzureTtsClient, synthesizeSpeech } from "../src/index.ts";

type CapturedRequest = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function installFetchMock(audio: ArrayBuffer) {
  const originalFetch = globalThis.fetch;
  let capturedRequest: CapturedRequest | undefined;

  globalThis.fetch = async (input, init) => {
    capturedRequest = { input, init };
    return {
      ok: true,
      arrayBuffer: async () => audio,
    } as Response;
  };

  return {
    get request() {
      return capturedRequest;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function assertAzureRequest(
  request: CapturedRequest | undefined,
  endpoint: string,
  subscriptionKey: string,
  ssml: string,
) {
  assert.ok(request);
  assert.equal(request.input, endpoint);
  assert.equal(request.init?.method, "POST");
  assert.deepEqual(request.init?.headers, {
    "Ocp-Apim-Subscription-Key": subscriptionKey,
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
  });
  assert.equal(request.init?.body, ssml);
}

test("synthesizeSpeech sends SSML using the supplied configuration", async () => {
  const mockAudio = new ArrayBuffer(3);
  new Uint8Array(mockAudio).set([4, 5, 6]);
  const fetchMock = installFetchMock(mockAudio);
  const ssml = "<speak>Hello</speak>";

  try {
    const audio = await synthesizeSpeech(ssml, {
      endpoint: "https://speech.example.test/cognitiveservices/v1",
      subscriptionKey: "subscription-key",
      region: "japaneast",
    });

    assertAzureRequest(
      fetchMock.request,
      "https://speech.example.test/cognitiveservices/v1",
      "subscription-key",
      ssml,
    );
    assert.strictEqual(audio, mockAudio);
  } finally {
    fetchMock.restore();
  }
});

test("synthesize sends SSML to the regional Azure endpoint", async () => {
  const mockAudio = new ArrayBuffer(3);
  new Uint8Array(mockAudio).set([1, 2, 3]);
  const fetchMock = installFetchMock(mockAudio);
  const ssml = "<speak>Hello</speak>";

  try {
    const audio = await new AzureTtsClient({
      subscriptionKey: "subscription-key",
      region: "japaneast",
    }).synthesize(ssml);

    assertAzureRequest(
      fetchMock.request,
      "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1",
      "subscription-key",
      ssml,
    );
    assert.strictEqual(audio, mockAudio);
  } finally {
    fetchMock.restore();
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
