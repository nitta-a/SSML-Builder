import assert from "node:assert/strict";
import test from "node:test";
import {
  AzureTtsError,
  SynthesisCancelledError,
  SynthesisTimeoutError,
  UnsupportedMergeFormatError,
  mergeSynthesisResults,
  synthesizeSsmlChunksSafe,
  synthesizeSsmlSafe,
} from "../src/index.ts";

const audio = (values: number[]): ArrayBuffer => Uint8Array.from(values).buffer;
const validSsml = (text: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">${text}</voice></speak>`;

test("merge APIs require a format at runtime and expose MIME metadata", async () => {
  assert.throws(
    () => mergeSynthesisResults([{ audioData: audio([1]), durationMs: 1 }], undefined as never),
    (error: unknown) => error instanceof UnsupportedMergeFormatError && error.kind === "unsupported-format-error",
  );
  const merged = mergeSynthesisResults([{ audioData: audio([1]), durationMs: 1 }], {
    format: "webm-24khz-16bit-mono-opus",
    customMerger: (buffers) => buffers[0] ?? new ArrayBuffer(0),
  });
  assert.equal((await merged).mimeType, "audio/webm");
});

test("safe synthesis returns each discriminated error kind", async () => {
  const validation = await synthesizeSsmlSafe(
    { synthesizeSsml: async () => ({ audioData: new ArrayBuffer(0), durationMs: 0 }) },
    "<speak>",
  );
  assert.equal(validation.ok, false);
  if (!validation.ok) assert.equal(validation.error.kind, "validation-error");

  const azure = await synthesizeSsmlSafe(
    {
      synthesizeSsml: async () => {
        throw new AzureTtsError(429, "Too Many Requests", "{}", "req");
      },
    },
    validSsml("hello"),
  );
  assert.equal(azure.ok, false);
  if (!azure.ok) {
    assert.equal(azure.error.kind, "azure-api-error");
    assert.equal(azure.error.status, 429);
  }

  for (const error of [new SynthesisTimeoutError("timed out"), new SynthesisCancelledError()]) {
    const result = await synthesizeSsmlChunksSafe(
      {
        synthesizeSsml: async () => {
          throw error;
        },
      },
      [validSsml("hello")],
      { outputFormat: "audio-16khz-128kbitrate-mono-mp3" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, error.kind);
  }
});

test("chunk safe synthesis propagates output, cancellation, timeout, and source path settings", async () => {
  const controller = new AbortController();
  const calls: Array<{ options?: Record<string, unknown> }> = [];
  let validatorSignal: AbortSignal | undefined;
  let validatorPath: readonly string[] | undefined;
  const result = await synthesizeSsmlChunksSafe(
    {
      synthesizeSsml: async (_ssml, options) => {
        calls.push({ options: options as Record<string, unknown> });
        return { audioData: new ArrayBuffer(0), durationMs: 0 };
      },
    },
    [
      {
        ssml: `${validSsml("hello").replace("</voice>", '<audio src="https://example.test/a.mp3"/></voice>')}`,
        originalTextRange: { start: 10, end: 15 },
      },
    ],
    {
      allowExternalAudio: true,
      outputFormat: "audio-16khz-128kbitrate-mono-mp3",
      signal: controller.signal,
      timeoutMs: 1234,
      sourceNodePath: ["speak", "voice[0]"],
      urlValidator: async (_url, context, signal) => {
        validatorPath = context.sourceNodePath;
        validatorSignal = signal;
        return true;
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.options?.outputFormat, "audio-16khz-128kbitrate-mono-mp3");
  assert.equal(calls[0]?.options?.signal, controller.signal);
  assert.equal(calls[0]?.options?.timeoutMs, 1234);
  assert.deepEqual(calls[0]?.options?.sourceNodePath, ["speak", "voice[0]"]);
  assert.equal(validatorSignal, controller.signal);
  assert.deepEqual(validatorPath, ["speak", "voice[0]"]);
});
