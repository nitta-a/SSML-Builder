import assert from "node:assert/strict";
import test from "node:test";
import {
  AudioFormatMismatchError,
  AzureTtsError,
  AzureTtsClient,
  DeadlineController,
  IncompleteChunkSetError,
  inspectAudioSpecification,
  serializeChunkError,
  synthesizeSsmlChunksSafe,
  synthesizeSsmlSafe,
  computeChunkFingerprint,
} from "../src/index.ts";

const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">${text}</voice></speak>`;

function ebmlSize(size: number): Uint8Array {
  if (size < 0x7f) return Uint8Array.of(0x80 | size);
  if (size < 0x3fff) return Uint8Array.of(0x40 | (size >> 8), size & 0xff);
  throw new Error("Test fixture is too large.");
}

function ebmlElement(id: readonly number[], data: Uint8Array): Uint8Array {
  return Uint8Array.from([...id, ...ebmlSize(data.byteLength), ...data]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

function oggOpus(): ArrayBuffer {
  const payload = new Uint8Array(19);
  payload.set(new TextEncoder().encode("OpusHead"));
  payload[8] = 1;
  payload[9] = 1;
  new DataView(payload.buffer).setUint32(12, 16_000, true);
  const page = new Uint8Array(27 + 1 + payload.byteLength);
  page.set(new TextEncoder().encode("OggS"));
  page[26] = 1;
  page[27] = payload.byteLength;
  page.set(payload, 28);
  return page.buffer;
}

function webmOpus(): ArrayBuffer {
  const sampling = new ArrayBuffer(8);
  new DataView(sampling).setFloat64(0, 24_000, false);
  const audio = ebmlElement(
    [0xe1],
    concatBytes(ebmlElement([0xb5], new Uint8Array(sampling)), ebmlElement([0x9f], Uint8Array.of(1))),
  );
  const track = ebmlElement(
    [0xae],
    Uint8Array.from([
      ...ebmlElement([0xd7], Uint8Array.of(1)),
      ...ebmlElement([0x83], Uint8Array.of(2)),
      ...ebmlElement([0x86], new TextEncoder().encode("A_OPUS")),
      ...audio,
    ]),
  );
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], track);
  const ebml = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], ebmlElement([0x42, 0x82], new TextEncoder().encode("webm")));
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], tracks);
  return Uint8Array.from([...ebml, ...segment]).buffer;
}

test("fingerprints include the complete synthesis environment", () => {
  const base = computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", {
    region: "eastus",
    endpoint: "https://eastus.example.test/tts",
    customHeaders: { "x-tenant": "a" },
    fingerprintSchemaVersion: "2",
  });
  assert.notEqual(
    base,
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", {
      region: "japaneast",
      endpoint: "https://japaneast.example.test/tts",
      customHeaders: { "x-tenant": "a" },
      fingerprintSchemaVersion: "2",
    }),
  );
  assert.notEqual(
    base,
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", {
      region: "eastus",
      endpoint: "https://eastus.example.test/tts",
      customHeaders: { "x-tenant": "b" },
      fingerprintSchemaVersion: "2",
    }),
  );
});

test("fingerprints canonicalize headers and support explicit voice and language inputs", () => {
  const options = {
    region: "eastus",
    endpoint: "https://eastus.example.test/tts",
    customHeaders: { "x-tenant": "a", "x-request": "b" },
    voice: "en-US-JennyNeural",
    lang: "en-US",
    schemaVersion: "legacy",
  } as const;
  assert.equal(
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", options),
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", {
      ...options,
      customHeaders: { "x-request": "b", "x-tenant": "a" },
      fingerprintSchemaVersion: "legacy",
    }),
  );
  assert.notEqual(
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", options),
    computeChunkFingerprint(validSsml("hello"), "audio-16khz-128kbitrate-mono-mp3", {
      ...options,
      voice: "en-US-AriaNeural",
    }),
  );
});

test("serializes synthesis failures with stable codes and retry metadata", () => {
  const retryable = serializeChunkError(
    new AzureTtsError(503, "Service Unavailable", "", "request-1"),
    "synthesis",
    true,
  );
  assert.deepEqual(retryable, {
    code: "AZURE_API_ERROR",
    phase: "synthesis",
    message: "Azure TTS request failed: 503 Service Unavailable",
    isOriginalFailure: true,
    isRetryable: true,
    httpStatus: 503,
    details: { statusText: "Service Unavailable", requestId: "request-1" },
  });

  const incomplete = serializeChunkError(new IncompleteChunkSetError(3, [1, 2]), "merge", false);
  assert.equal(incomplete.code, "MERGE_ERROR");
  assert.equal(incomplete.isRetryable, false);
  assert.deepEqual(incomplete.details, { totalChunks: 3, missingChunkIndices: [1, 2] });
  assert.equal(serializeChunkError(new Error("request aborted"), "synthesis", false).code, "CANCELLED");
});

test("DeadlineController distinguishes cancellation from expiry and cleans up", async () => {
  const cancelled = new DeadlineController(1_000);
  cancelled.abort();
  assert.equal(cancelled.signal.aborted, true);
  assert.throws(() => cancelled.throwIfExpired(), /cancelled/);
  cancelled.dispose();

  const expired = new DeadlineController(5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(expired.timedOut, true);
  assert.throws(() => expired.throwIfExpired(), /total job deadline/);
  expired.dispose();
});

test("refuses to merge when resumeChunkIndices leave a chunk missing", async () => {
  const fingerprint = computeChunkFingerprint(validSsml("one"));
  const result = await synthesizeSsmlChunksSafe(
    { synthesizeSsml: async () => ({ audioData: Uint8Array.of(1).buffer, durationMs: 1 }) },
    [validSsml("one"), validSsml("two")],
    {
      resumeChunks: [{ chunkIndex: 0, fingerprint, audioData: Uint8Array.of(1).buffer, durationMs: 1 }],
      resumeChunkIndices: [0],
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof IncompleteChunkSetError);
});

test("applies totalJobMs to one safe synthesis before the client resolves", async () => {
  const result = await synthesizeSsmlSafe(
    {
      synthesizeSsml: async (_ssml, options) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ audioData: new ArrayBuffer(0), durationMs: 0 }), 100);
          options?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("Speech synthesis was cancelled."));
          });
        }),
    },
    validSsml("slow"),
    { timeouts: { totalJobMs: 10 } },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "timeout");
});

test("forwards v2.19 synthesis options through the safe chunk client path", async () => {
  let received: Record<string, unknown> | undefined;
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async () => ({ audioData: Uint8Array.of(1).buffer, durationMs: 1 }),
      synthesizeChunks: async (_chunks, options) => {
        received = options as Record<string, unknown>;
        return { audioData: Uint8Array.of(2).buffer, durationMs: 2 };
      },
    },
    [validSsml("chunk")],
    {
      customHeaders: { "x-tenant": "a" },
      fingerprintSchemaVersion: "3",
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received?.customHeaders, { "x-tenant": "a" });
  assert.equal(received?.fingerprintSchemaVersion, "3");
});

test("AzureTtsClient includes default fingerprint settings when resuming chunks", async () => {
  const ssml = validSsml("cached");
  const headers = { "x-tenant": "a" };
  const endpoint = "https://eastus.example.test/tts";
  const cached = {
    chunkIndex: 0,
    fingerprint: computeChunkFingerprint(ssml, undefined, {
      region: "eastus",
      endpoint,
      customHeaders: headers,
    }),
    audioData: new ArrayBuffer(0),
    durationMs: 1,
  };
  const result = await new AzureTtsClient({
    subscriptionKey: "subscription-key",
    region: "eastus",
    endpoint,
    customHeaders: headers,
  }).synthesizeChunks([ssml], { resumeChunks: [cached] });

  assert.equal(result.durationMs, 1);
  assert.equal(result.audioData.byteLength, 0);
});

test("validates Ogg and WebM codec headers", () => {
  const ogg = inspectAudioSpecification(oggOpus(), "ogg-16khz-16bit-mono-opus");
  assert.deepEqual(
    { codec: ogg.codec, sampleRate: ogg.sampleRate, channels: ogg.channels, container: ogg.container },
    { codec: "opus", sampleRate: 16_000, channels: 1, container: "ogg" },
  );
  const webm = inspectAudioSpecification(webmOpus(), "webm-24khz-16bit-mono-opus");
  assert.deepEqual(
    { codec: webm.codec, sampleRate: webm.sampleRate, channels: webm.channels, mimeType: webm.mimeType },
    { codec: "opus", sampleRate: 24_000, channels: 1, mimeType: "audio/webm" },
  );
  assert.throws(() =>
    inspectAudioSpecification(Uint8Array.of(0x4f, 0x67, 0x67, 0x53).buffer, "ogg-16khz-16bit-mono-opus"),
  );
  assert.throws(() => inspectAudioSpecification(Uint8Array.of(0x1a, 0x45, 0xdf).buffer, "webm-24khz-16bit-mono-opus"));
  assert.throws(
    () => inspectAudioSpecification(oggOpus(), "ogg-24khz-16bit-mono-opus"),
    (error: unknown) => error instanceof AudioFormatMismatchError,
  );
});

test("validates RAW SILK and Opus framing headers", () => {
  const silk = Uint8Array.from([...new TextEncoder().encode("#!SILK_V3"), 0x0a]).buffer;
  assert.equal(inspectAudioSpecification(silk, "raw-16khz-16bit-mono-silk").codec, "silk");
  assert.throws(() => inspectAudioSpecification(new ArrayBuffer(10), "raw-16khz-16bit-mono-silk"));
  assert.equal(inspectAudioSpecification(Uint8Array.of(0, 0).buffer, "raw-48khz-16bit-mono-opus").codec, "opus");
  assert.throws(() => inspectAudioSpecification(Uint8Array.of(0x1f, 0).buffer, "raw-48khz-16bit-mono-opus"));
});
