import assert from "node:assert/strict";
import test from "node:test";

delete process.env.AZURE_SPEECH_KEY;
delete process.env.AZURE_SPEECH_REGION;
delete process.env.AZURE_SPEECH_ENDPOINT;
const unconfiguredRoute: typeof import("../app/api/synthesize/route.ts") = await import(
  new URL("../app/api/synthesize/route.ts?unconfigured", import.meta.url).href
);

process.env.AZURE_SPEECH_KEY = "test-only-subscription-key";
process.env.AZURE_SPEECH_REGION = "test-only-region";
const configuredRoute: typeof import("../app/api/synthesize/route.ts") = await import(
  new URL("../app/api/synthesize/route.ts?configured", import.meta.url).href
);
delete process.env.AZURE_SPEECH_KEY;
delete process.env.AZURE_SPEECH_REGION;

test("configuration endpoint exposes only a no-store boolean, never credentials", async () => {
  for (const [route, expected] of [
    [unconfiguredRoute, false],
    [configuredRoute, true],
  ] as const) {
    const response = route.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { configured: expected });
  }
});

function request(body: string): Request {
  return new Request("http://localhost/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json();
  assert.ok(body !== null && typeof body === "object" && "error" in body);
  assert.equal(typeof body.error, "string");
  assert.ok(typeof body.error === "string" && body.error.length > 0);
  return body.error;
}

test("synthesis rejects invalid JSON and request shapes before Azure is contacted", async () => {
  for (const body of ["{broken", "null", "[]", "{}", '{"ssml":3}', '{"ssml":" "}', '{"ssml":"<speak"}']) {
    const response = await configuredRoute.POST(request(body));
    assert.equal(response.status, 400, body);
    await readError(response);
  }
});

test("synthesis rejects Azure semantic errors before checking configuration", async () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><break time="invalid"/>Hello.</voice></speak>';
  const response = await unconfiguredRoute.POST(request(JSON.stringify({ ssml })));
  assert.equal(response.status, 400);
  assert.match(await readError(response), /Invalid Azure SSML/);
});

test("valid SSML without Azure configuration reports an explicit service error", async () => {
  const ssml = '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello.</voice></speak>';
  const response = await unconfiguredRoute.POST(request(JSON.stringify({ ssml })));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Azure Speech is not configured." });
});
