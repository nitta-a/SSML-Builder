import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechSdkError } from "./errors.ts";
import { createSpeechConfig } from "./speechConfig.ts";
import type { TtsConfig } from "./types.ts";

function closeSpeechResources(speechConfig: SpeechSDK.SpeechConfig, synthesizer: SpeechSDK.SpeechSynthesizer): void {
  try {
    synthesizer.close();
  } catch {}

  try {
    speechConfig.close();
  } catch {}
}

export async function synthesizeSpeech(ssml: string, config: TtsConfig): Promise<ArrayBuffer> {
  if (config.signal?.aborted) {
    throw createSpeechSdkError("Speech synthesis was cancelled.");
  }

  const speechConfig = createSpeechConfig(config);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    let resourcesClosed = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (abortHandler) config.signal?.removeEventListener("abort", abortHandler);
    };
    const closeResources = () => {
      if (resourcesClosed) return;
      resourcesClosed = true;
      closeSpeechResources(speechConfig, synthesizer);
    };
    const rejectWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeResources();
      reject(createSpeechSdkError(error));
    };

    const cb = (result: SpeechSDK.SpeechSynthesisResult) => {
      if (settled) return;
      const { reason, errorDetails } = result;
      if (reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        const err = errorDetails || `Speech synthesis failed with reason ${reason}.`;
        rejectWithError(err);
        return;
      }
      settled = true;
      cleanup();
      closeResources();
      resolve(result.audioData);
    };

    try {
      if (config.signal) {
        abortHandler = () => rejectWithError("Speech synthesis was cancelled.");
        config.signal.addEventListener("abort", abortHandler, { once: true });
      }
      if (config.timeoutMs !== undefined && config.timeoutMs > 0) {
        timeout = setTimeout(
          () => rejectWithError(`Speech synthesis timed out after ${config.timeoutMs} ms.`),
          config.timeoutMs,
        );
      }
      synthesizer.speakSsmlAsync(ssml, cb, rejectWithError);
    } catch (error) {
      rejectWithError(error);
    }
  });
}
