import assert from "node:assert/strict";
import test from "node:test";
import {
  AzureTtsError,
  AzureTtsSdkError,
  createSpeechSdkError,
} from "../src/errors.ts";

test("AzureTtsError exposes HTTP response metadata", () => {
  const error = new AzureTtsError(
    401,
    "Unauthorized",
    '{"error":"invalid key"}',
    "request-id",
  );

  assert.ok(error instanceof Error);
  assert.equal(error.name, "AzureTtsError");
  assert.equal(error.message, "Azure TTS request failed: 401 Unauthorized");
  assert.equal(error.status, 401);
  assert.equal(error.statusText, "Unauthorized");
  assert.equal(error.responseBody, '{"error":"invalid key"}');
  assert.equal(error.requestId, "request-id");
});

test("AzureTtsSdkError preserves SDK error details", () => {
  const error = new AzureTtsSdkError("The SSML is invalid.");

  assert.ok(error instanceof AzureTtsError);
  assert.equal(error.name, "AzureTtsSdkError");
  assert.equal(error.message, "Azure TTS synthesis failed: The SSML is invalid.");
  assert.equal(error.status, 0);
  assert.equal(error.statusText, "Speech SDK");
  assert.equal(error.responseBody, "The SSML is invalid.");
  assert.equal(error.requestId, null);
  assert.equal(error.errorDetails, "The SSML is invalid.");
});

test("createSpeechSdkError normalizes Error and unknown values", () => {
  assert.equal(
    createSpeechSdkError(new Error("network unavailable")).message,
    "Azure TTS synthesis failed: network unavailable",
  );
  assert.equal(
    createSpeechSdkError("request failed").errorDetails,
    "request failed",
  );
});
