import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { AzureTtsClient, synthesizeSpeech } from "../src/index.ts";

function installSuccessfulSpeechSdkMock(testContext: TestContext, audio: ArrayBuffer): { endpoint?: URL } {
  const captured: { endpoint?: URL } = {};
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;

  testContext.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (endpoint, subscriptionKey) => {
    captured.endpoint = endpoint;
    return originalFromEndpoint(endpoint, String(subscriptionKey));
  });
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", (_ssml, callback) => {
    callback?.({
      audioData: audio,
      errorDetails: "",
      reason: SpeechSDK.ResultReason.SynthesizingAudioCompleted,
    } as SpeechSDK.SpeechSynthesisResult);
  });
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {});

  return captured;
}

test("synthesizeSpeech replaces every endpoint region placeholder", async (t) => {
  const audio = new ArrayBuffer(1);
  const speechSdkMock = installSuccessfulSpeechSdkMock(t, audio);

  const result = await synthesizeSpeech("<speak>Hello</speak>", {
    endpoint: "https://{region}.example.test/{region}",
    subscriptionKey: "subscription-key",
    region: "japan-east",
  });

  assert.equal(speechSdkMock.endpoint?.href, "https://japan-east.example.test/japan-east");
  assert.strictEqual(result, audio);
});

test("synthesizeSpeech URL-encodes special regions in endpoint paths", async (t) => {
  const audio = new ArrayBuffer(1);
  const speechSdkMock = installSuccessfulSpeechSdkMock(t, audio);

  await synthesizeSpeech("<speak>Hello</speak>", {
    endpoint: "https://speech.example.test/{region}/{region}",
    subscriptionKey: "subscription-key",
    region: "japan east",
  });

  assert.equal(speechSdkMock.endpoint?.href, "https://speech.example.test/japan%20east/japan%20east");
});

test("AzureTtsClient reports Speech SDK callback failures", async (t) => {
  const errorDetails = "network unavailable";
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;

  t.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (endpoint, subscriptionKey) =>
    originalFromEndpoint(endpoint, String(subscriptionKey)),
  );
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", (_ssml, _callback, errorCallback) => {
    errorCallback?.(errorDetails);
  });
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {});

  await assert.rejects(
    new AzureTtsClient({
      endpoint: "https://speech.example.test/cognitiveservices/v1",
      subscriptionKey: "subscription-key",
      region: "japaneast",
    }).synthesize("<speak>Hello</speak>"),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : error, "Azure TTS synthesis failed: network unavailable");
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AzureTtsSdkError");
      return true;
    },
  );
});

test("synthesizeSpeech aborts a timed-out synthesis and closes resources", async (t) => {
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;
  let closeCount = 0;
  t.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (endpoint, subscriptionKey) =>
    originalFromEndpoint(endpoint, String(subscriptionKey)),
  );
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", () => {});
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {
    closeCount += 1;
  });

  await assert.rejects(
    synthesizeSpeech("<speak>Hello</speak>", {
      endpoint: "https://speech.example.test/cognitiveservices/v1",
      subscriptionKey: "subscription-key",
      region: "japaneast",
      timeoutMs: 10,
    }),
    /timed out after 10 ms/,
  );
  assert.equal(closeCount, 1);
});

test("synthesizeSpeech can be cancelled with an AbortSignal", async (t) => {
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;
  const controller = new AbortController();
  t.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (endpoint, subscriptionKey) =>
    originalFromEndpoint(endpoint, String(subscriptionKey)),
  );
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", () => {});
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {});

  const promise = synthesizeSpeech("<speak>Hello</speak>", {
    endpoint: "https://speech.example.test/cognitiveservices/v1",
    subscriptionKey: "subscription-key",
    region: "japaneast",
    signal: controller.signal,
  });
  controller.abort();

  await assert.rejects(promise, /cancelled/);
});
