import assert from "node:assert/strict";
import test from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechConfig, resolveEndpoint } from "../src/speechConfig.ts";

test("replaces and URL-encodes every endpoint region placeholder", () => {
  assert.equal(
    resolveEndpoint({
      endpoint: "https://{region}.example.test/{region}",
      subscriptionKey: "subscription-key",
      region: "japan east",
    }),
    "https://japan%20east.example.test/japan%20east",
  );
});

test("creates Speech SDK configuration with the default format", () => {
  const speechConfig = createSpeechConfig({
    endpoint: "https://speech.example.test/cognitiveservices/v1",
    subscriptionKey: "subscription-key",
    region: "japaneast",
  });

  try {
    assert.equal(
      speechConfig.speechSynthesisOutputFormat,
      SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3,
    );
  } finally {
    speechConfig.close();
  }
});

test("creates Speech SDK configuration with a custom format", () => {
  const speechConfig = createSpeechConfig({
    endpoint: "https://speech.example.test/cognitiveservices/v1",
    subscriptionKey: "subscription-key",
    region: "japaneast",
    outputFormat: "raw-22050hz-16bit-mono-pcm",
  });

  try {
    assert.equal(
      speechConfig.speechSynthesisOutputFormat,
      SpeechSDK.SpeechSynthesisOutputFormat.Raw22050Hz16BitMonoPcm,
    );
  } finally {
    speechConfig.close();
  }
});
