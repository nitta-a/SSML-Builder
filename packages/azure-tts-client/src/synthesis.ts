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
  const speechConfig = createSpeechConfig(config);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    let resourcesClosed = false;
    const closeResources = () => {
      if (resourcesClosed) return;
      resourcesClosed = true;
      closeSpeechResources(speechConfig, synthesizer);
    };
    const rejectWithError = (error: unknown) => {
      closeResources();
      reject(createSpeechSdkError(error));
    };

    const cb = (result: SpeechSDK.SpeechSynthesisResult) => {
      const { reason, errorDetails } = result;
      if (reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        const err = errorDetails || `Speech synthesis failed with reason ${reason}.`;
        rejectWithError(err);
        return;
      }
      closeResources();
      resolve(result.audioData);
    };

    try {
      synthesizer.speakSsmlAsync(ssml, cb, rejectWithError);
    } catch (error) {
      rejectWithError(error);
    }
  });
}
