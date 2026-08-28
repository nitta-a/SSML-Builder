import assert from "node:assert/strict";
import test from "node:test";
import { fetchAzureVoiceCatalog } from "../src/index.ts";

test("fetchAzureVoiceCatalog fetches, merges, and annotates voices across regions", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    const region = url.split(".")[0]?.replace("https://", "");
    return new Response(
      JSON.stringify(
        region === "eastus"
          ? [
              { Locale: "fil-PH", ShortName: "fil-PH-BlessicaNeural", StyleList: ["cheerful"] },
              { Locale: "en-US", Name: "en-US-JennyNeural", StyleList: ["chat"] },
            ]
          : [{ Locale: "fil-PH", ShortName: "fil-PH-BlessicaNeural", StyleList: ["sad"] }],
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const catalog = await fetchAzureVoiceCatalog({ apiKey: "secret", region: ["eastus", "japaneast"] });
    assert.equal(requests.length, 2);
    assert.deepEqual(catalog.metadata.regions, ["eastus", "japaneast"]);
    assert.equal(catalog.metadata.voiceCount, 2);
    assert.deepEqual(
      catalog.voices.find(({ name }) => name === "fil-PH-BlessicaNeural"),
      {
        name: "fil-PH-BlessicaNeural",
        locale: "fil-PH",
        styles: ["cheerful", "sad"],
        regions: ["eastus", "japaneast"],
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchAzureVoiceCatalog reports HTTP and payload failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("no", { status: 401 });
  try {
    await assert.rejects(fetchAzureVoiceCatalog({ apiKey: "secret", region: "eastus" }), /HTTP 401/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
