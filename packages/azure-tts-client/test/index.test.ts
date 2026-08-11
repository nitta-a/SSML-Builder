import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { AzureTtsClient, AzureTtsError, AzureTtsSdkError, synthesizeSpeech } from "../src/index.ts";

type SpeechSdkMock = {
  endpoint?: URL;
  subscriptionKey?: string;
  speechConfig?: SpeechSDK.SpeechConfig;
  ssml?: string;
  closeCount: number;
};

function installSpeechSdkMock(testContext: TestContext, audio: ArrayBuffer): SpeechSdkMock {
  const captured: SpeechSdkMock = { closeCount: 0 };
  const originalFromEndpoint = SpeechSDK.SpeechConfig.fromEndpoint;

  testContext.mock.method(SpeechSDK.SpeechConfig, "fromEndpoint", (endpoint, subscriptionKey) => {
    captured.endpoint = endpoint;
    captured.subscriptionKey = String(subscriptionKey);
    const speechConfig = originalFromEndpoint(endpoint, String(subscriptionKey));
    captured.speechConfig = speechConfig;
    return speechConfig;
  });
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", (ssml, callback) => {
    captured.ssml = ssml;
    callback?.({
      audioData: audio,
      errorDetails: "",
      reason: SpeechSDK.ResultReason.SynthesizingAudioCompleted,
    } as SpeechSDK.SpeechSynthesisResult);
  });
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "close", () => {
    captured.closeCount += 1;
  });

  return captured;
}

function installSpeechSdkErrorMock(testContext: TestContext, errorDetails: string): SpeechSdkMock {
  const captured = installSpeechSdkMock(testContext, new ArrayBuffer(0));
  testContext.mock.method(SpeechSDK.SpeechSynthesizer.prototype, "speakSsmlAsync", (ssml, _callback, errorCallback) => {
    captured.ssml = ssml;
    errorCallback?.(errorDetails);
  });
  return captured;
}

test("synthesizeSpeech sends SSML using the Speech SDK", async (t) => {
  const mockAudio = new ArrayBuffer(3);
  new Uint8Array(mockAudio).set([4, 5, 6]);
  const speechSdkMock = installSpeechSdkMock(t, mockAudio);
  const ssml = "<speak>Hello</speak>";

  const audio = await synthesizeSpeech(ssml, {
    endpoint: "https://speech.example.test/cognitiveservices/v1",
    subscriptionKey: "subscription-key",
    region: "japaneast",
  });

  assert.equal(speechSdkMock.endpoint?.href, "https://speech.example.test/cognitiveservices/v1");
  assert.equal(speechSdkMock.subscriptionKey, "subscription-key");
  assert.equal(speechSdkMock.ssml, ssml);
  assert.equal(
    speechSdkMock.speechConfig?.speechSynthesisOutputFormat,
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3,
  );
  assert.strictEqual(audio, mockAudio);
  assert.equal(speechSdkMock.closeCount, 1);
});

test("synthesize uses the configured output format", async (t) => {
  const mockAudio = new ArrayBuffer(3);
  const speechSdkMock = installSpeechSdkMock(t, mockAudio);
  const ssml = "<speak>Hello</speak>";

  const audio = await new AzureTtsClient({
    subscriptionKey: "subscription-key",
    region: "japaneast",
    outputFormat: "audio-24khz-160kbitrate-mono-mp3",
  }).synthesize(ssml);

  assert.equal(
    speechSdkMock.speechConfig?.speechSynthesisOutputFormat,
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
  );
  assert.strictEqual(audio, mockAudio);
});

test("synthesize sends SSML to the regional Azure endpoint", async (t) => {
  const mockAudio = new ArrayBuffer(3);
  const speechSdkMock = installSpeechSdkMock(t, mockAudio);
  const ssml = "<speak>Hello</speak>";

  const audio = await new AzureTtsClient({
    subscriptionKey: "subscription-key",
    region: "japaneast",
  }).synthesize(ssml);

  assert.equal(speechSdkMock.endpoint?.href, "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(speechSdkMock.ssml, ssml);
  assert.strictEqual(audio, mockAudio);
});

test("synthesize reports Speech SDK synthesis errors", async (t) => {
  const errorDetails = "The SSML is invalid.";
  installSpeechSdkErrorMock(t, errorDetails);

  await assert.rejects(
    new AzureTtsClient({
      subscriptionKey: "subscription-key",
      region: "japaneast",
    }).synthesize("<speak>Hello</speak>"),
    (error: unknown) => {
      assert.ok(error instanceof AzureTtsError);
      assert.ok(error instanceof AzureTtsSdkError);
      assert.equal(error.message, "Azure TTS synthesis failed: The SSML is invalid.");
      assert.equal(error.status, 0);
      assert.equal(error.statusText, "Speech SDK");
      assert.equal(error.responseBody, errorDetails);
      assert.equal(error.requestId, null);
      assert.equal(error.errorDetails, errorDetails);
      return true;
    },
  );
});
