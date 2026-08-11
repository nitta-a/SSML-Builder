import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechSdkError } from "./errors";
import { createSpeechConfig } from "./speechConfig";
import type { TtsConfig } from "./types";

function closeSpeechResources(
  speechConfig: SpeechSDK.SpeechConfig,
  synthesizer: SpeechSDK.SpeechSynthesizer,
): void {
  try {
    synthesizer.close();
  } catch {}

  try {
    speechConfig.close();
  } catch {}
}

export async function synthesizeSpeech(
  ssml: string,
  config: TtsConfig,
): Promise<ArrayBuffer> {
  const speechConfig = createSpeechConfig(config);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    let resourcesClosed = false;
    const closeResources = () => {
      if (resourcesClosed) {
        return;
      }

      resourcesClosed = true;
      closeSpeechResources(speechConfig, synthesizer);
    };
    const rejectWithError = (error: unknown) => {
      closeResources();
      reject(createSpeechSdkError(error));
    };

    try {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (
            result.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted
          ) {
            rejectWithError(
              result.errorDetails ||
                `Speech synthesis failed with reason ${result.reason}.`,
            );
            return;
          }

          const audioData = result.audioData;
          closeResources();
          resolve(audioData);
        },
        rejectWithError,
      );
    } catch (error) {
      rejectWithError(error);
    }
  });
}
