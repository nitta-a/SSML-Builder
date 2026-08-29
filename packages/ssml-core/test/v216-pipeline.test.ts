import assert from "node:assert/strict";
import test from "node:test";
import { validateAzureSsmlChunks } from "../src/index.ts";

const chunk = (src: string) =>
  `<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><audio src="${src}"/></voice></speak>`;

test("batch Azure validation shares in-flight URL checks and annotates diagnostics", async () => {
  let calls = 0;
  const diagnostics = await validateAzureSsmlChunks(
    [chunk("https://media.example.test/a.mp3"), chunk("https://media.example.test/a.mp3")],
    {
      allowExternalAudio: true,
      urlValidatorConcurrency: 1,
      urlValidator: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 2));
        return false;
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(diagnostics.length, 2);
  const urlDiagnostic = diagnostics[0]?.find((diagnostic) => diagnostic.tagName === "audio");
  assert.equal(urlDiagnostic?.chunkIndex, 0);
  assert.ok(urlDiagnostic?.range && urlDiagnostic.range.end > urlDiagnostic.range.start);
});
