import { AzureTtsClient, AzureTtsError } from "@ssml-builder/azure-tts-client";
import { parseSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";
import { containsVoiceTag } from "./validation.ts";

export const runtime = "nodejs";

const AUDIO_CONTENT_TYPE = "audio/mpeg";
const MAX_LOGGED_RESPONSE_BODY_LENGTH = 4096;
const subscriptionKey = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
const endpoint = process.env.AZURE_SPEECH_ENDPOINT || "";
const PARSER_POSITION_SUFFIX = / at position \d+$/;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function truncateForLog(value: string): string {
  if (value.length <= MAX_LOGGED_RESPONSE_BODY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOGGED_RESPONSE_BODY_LENGTH)}… [truncated]`;
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof AzureTtsError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      requestId: error.requestId,
      responseBody: truncateForLog(error.responseBody),
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
}

function getSsmlValidationMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const positionMatch = PARSER_POSITION_SUFFIX.exec(rawMessage);
  return positionMatch ? rawMessage.slice(0, positionMatch.index) : rawMessage;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (body === null || typeof body !== "object" || typeof (body as { ssml?: unknown }).ssml !== "string") {
    return errorResponse("Request body must include an SSML string.", 400);
  }

  const ssml = (body as { ssml: string }).ssml;
  if (ssml.trim().length === 0) {
    return errorResponse("SSML must not be empty.", 400);
  }

  let parsedSsml: SsmlDocument;
  try {
    parsedSsml = parseSsml(ssml);
  } catch (error) {
    return errorResponse(`Invalid SSML: ${getSsmlValidationMessage(error)}`, 400);
  }

  if (!containsVoiceTag(parsedSsml.children ?? [])) {
    return errorResponse("SSML must contain at least one <voice> element.", 400);
  }
  if (!subscriptionKey || !region) {
    return errorResponse("Azure Speech is not configured.", 503);
  }

  try {
    const opt = { subscriptionKey, region, endpoint };
    const client = new AzureTtsClient(opt);
    const audio = await client.synthesize(ssml);

    return new Response(new Uint8Array(audio), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": String(audio.byteLength),
        "Content-Type": AUDIO_CONTENT_TYPE,
      },
    });
  } catch (error) {
    console.error("Azure Speech synthesis failed.", {
      error: describeError(error),
      region,
      ssmlLength: ssml.length,
    });
    return errorResponse("Azure Speech synthesis failed.", 502);
  }
}
