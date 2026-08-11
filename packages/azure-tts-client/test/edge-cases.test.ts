import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { AzureTtsClient, synthesizeSpeech } from "../src/index.ts";

function installSuccessfulSpeechSdkMock(
  testContext: TestContext,
  audio: ArrayBuffer,
): { endpoint?: URL } {
  const captured: { endpoint?: URL } = {};
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;

  testContext.mock.method(
    SpeechSDK.SpeechConfig,
    "fromEndpoint",
    (endpoint, subscriptionKey) => {
      captured.endpoint = endpoint;
      return originalFromEndpoint(endpoint, String(subscriptionKey));
    },
  );
  testContext.mock.method(
    SpeechSDK.SpeechSynthesizer.prototype,
    "speakSsmlAsync",
    (_ssml, callback) => {
      callback?.({
        audioData: audio,
        errorDetails: "",
        reason: SpeechSDK.ResultReason.SynthesizingAudioCompleted,
      } as SpeechSDK.SpeechSynthesisResult);
    },
  );
  testContext.mock.method(
    SpeechSDK.SpeechSynthesizer.prototype,
    "close",
    () => {},
  );

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

  assert.equal(
    speechSdkMock.endpoint?.href,
    "https://japan-east.example.test/japan-east",
  );
  assert.strictEqual(result, audio);
});

test("AzureTtsClient reports Speech SDK callback failures", async (t) => {
  const errorDetails = "network unavailable";
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;

  t.mock.method(
    SpeechSDK.SpeechConfig,
    "fromEndpoint",
    (endpoint, subscriptionKey) =>
      originalFromEndpoint(endpoint, String(subscriptionKey)),
  );
  t.mock.method(
    SpeechSDK.SpeechSynthesizer.prototype,
    "speakSsmlAsync",
    (_ssml, _callback, errorCallback) => {
      errorCallback?.(errorDetails);
    },
  );
  t.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {});

  await assert.rejects(
    new AzureTtsClient({
      endpoint: "https://speech.example.test/cognitiveservices/v1",
      subscriptionKey: "subscription-key",
      region: "japaneast",
    }).synthesize("<speak>Hello</speak>"),
    (error: unknown) => {
      assert.equal(
        error instanceof Error ? error.message : error,
          "Azure TTS synthesis failed: network unavailable",
      );
      return true;
    },
  );
});
