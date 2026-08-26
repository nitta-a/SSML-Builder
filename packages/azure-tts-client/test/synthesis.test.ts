import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { synthesizeSpeech } from "../src/index.ts";

const endpoint = "https://speech.example.test/cognitiveservices/v1";
const subscriptionKey = "subscription-key";
const region = "japaneast";

function installHangingSynthesisMock(
  testContext: TestContext,
  onResult: (callback: (result: SpeechSDK.SpeechSynthesisResult) => void) => void,
  onClose: () => void,
): void {
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;
  testContext.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (speechEndpoint, key) =>
    originalFromEndpoint(speechEndpoint, String(key)),
  );
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", (_ssml, callback) => {
    if (callback) onResult(callback);
  });
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", onClose);
}

test("synthesizeSpeech aborts the SDK request and settles its promise", async (t) => {
  const controller = new AbortController();
  let closeCount = 0;
  let resultCallback: ((result: SpeechSDK.SpeechSynthesisResult) => void) | undefined;
  installHangingSynthesisMock(
    t,
    (callback) => (resultCallback = callback),
    () => (closeCount += 1),
  );

  const promise = synthesizeSpeech("<speak>Hello</speak>", {
    endpoint,
    subscriptionKey,
    region,
    signal: controller.signal,
  });
  controller.abort();

  await assert.rejects(promise, /Speech synthesis was cancelled/);
  assert.equal(closeCount, 1);

  resultCallback?.({
    audioData: new ArrayBuffer(1),
    errorDetails: "",
    reason: SpeechSDK.ResultReason.SynthesizingAudioCompleted,
  } as SpeechSDK.SpeechSynthesisResult);
  assert.equal(closeCount, 1);
});

test("synthesizeSpeech aborts the SDK request on timeout and settles its promise", async (t) => {
  let closeCount = 0;
  let resultCallback: ((result: SpeechSDK.SpeechSynthesisResult) => void) | undefined;
  installHangingSynthesisMock(
    t,
    (callback) => (resultCallback = callback),
    () => (closeCount += 1),
  );

  const promise = synthesizeSpeech("<speak>Hello</speak>", {
    endpoint,
    subscriptionKey,
    region,
    timeoutMs: 10,
  });

  await assert.rejects(promise, /Speech synthesis timed out after 10 ms/);
  assert.equal(closeCount, 1);

  resultCallback?.({
    audioData: new ArrayBuffer(1),
    errorDetails: "",
    reason: SpeechSDK.ResultReason.SynthesizingAudioCompleted,
  } as SpeechSDK.SpeechSynthesisResult);
  assert.equal(closeCount, 1);
});

const azureKey = process.env.AZURE_SPEECH_KEY;
const azureRegion = process.env.AZURE_SPEECH_REGION;

test("synthesizeSpeech reaches the Azure Speech API when credentials are configured", {
  skip: !azureKey || !azureRegion,
  timeout: 60_000,
}, async () => {
  if (!azureKey || !azureRegion) return;

  const audio = await synthesizeSpeech(
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Connectivity check.</voice></speak>',
    {
      subscriptionKey: azureKey,
      region: azureRegion,
      timeoutMs: 30_000,
    },
  );

  assert.ok(audio.byteLength > 0);
});
