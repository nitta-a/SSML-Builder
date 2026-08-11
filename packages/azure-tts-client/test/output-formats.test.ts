import assert from "node:assert/strict";
import test from "node:test";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import {
  DEFAULT_OUTPUT_FORMAT,
  resolveOutputFormat,
} from "../src/outputFormats.ts";

test("defines the default Azure Speech output format", () => {
  assert.equal(DEFAULT_OUTPUT_FORMAT, "audio-16khz-128kbitrate-mono-mp3");
  assert.equal(
    resolveOutputFormat(DEFAULT_OUTPUT_FORMAT),
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3,
  );
});

test("resolves supported output formats", () => {
  assert.equal(
    resolveOutputFormat("audio-24khz-160kbitrate-mono-mp3"),
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
  );
  assert.equal(
    resolveOutputFormat("ogg-48khz-16bit-mono-opus"),
    SpeechSDK.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus,
  );
});

test("rejects unsupported output formats", () => {
  assert.throws(
    () => resolveOutputFormat("unsupported-format"),
    new Error("Unsupported Azure Speech output format: unsupported-format"),
  );
});
