import { AzureTtsClient } from "@ssml-builder/azure-tts-client";
import { validateSsml } from "@ssml-builder/ssml-core";

export const runtime = "nodejs";

const AUDIO_CONTENT_TYPE = "audio/mpeg";

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (
    body === null ||
    typeof body !== "object" ||
    typeof (body as { ssml?: unknown }).ssml !== "string"
  ) {
    return errorResponse("Request body must include an SSML string.", 400);
  }

  const ssml = (body as { ssml: string }).ssml;
  if (ssml.trim().length === 0) {
    return errorResponse("SSML must not be empty.", 400);
  }

  const validationError = validateSsml(ssml);
  if (validationError) {
    return errorResponse(`Invalid SSML: ${validationError.message}`, 400);
  }

  const subscriptionKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!subscriptionKey || !region) {
    return errorResponse("Azure Speech is not configured.", 503);
  }

  try {
    const client = new AzureTtsClient({
      subscriptionKey,
      region,
      endpoint: process.env.AZURE_SPEECH_ENDPOINT || undefined,
    });
    const audio = await client.synthesize(ssml);

    return new Response(new Uint8Array(audio), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": String(audio.byteLength),
        "Content-Type": AUDIO_CONTENT_TYPE,
      },
    });
  } catch {
    return errorResponse("Azure Speech synthesis failed.", 502);
  }
}
