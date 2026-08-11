/**
 * azure-tts-client: Azure Text-to-Speech client for SSML playback.
 */

import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export interface TtsConfig {
  endpoint: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
}

export interface AzureTtsClientOptions {
  subscriptionKey: string;
  region: string;
  endpoint?: string;
  outputFormat?: string;
}

export class AzureTtsError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly responseBody: string;
  readonly requestId: string | null;

  constructor(
    status: number,
    statusText: string,
    responseBody: string,
    requestId: string | null,
  ) {
    super(`Azure TTS request failed: ${status} ${statusText}`);
    this.name = "AzureTtsError";
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
    this.requestId = requestId;
  }
}

export class AzureTtsSdkError extends AzureTtsError {
  readonly errorDetails: string;

  constructor(errorDetails: string) {
    super(0, "Speech SDK", errorDetails, null);
    this.name = "AzureTtsSdkError";
    this.message = `Azure TTS synthesis failed: ${errorDetails}`;
    this.errorDetails = errorDetails;
  }
}

const DEFAULT_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3";

const OUTPUT_FORMATS: Record<string, SpeechSDK.SpeechSynthesisOutputFormat> = {
  "raw-8khz-8bit-mono-mulaw":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw,
  "riff-16khz-16kbps-mono-siren":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff16Khz16KbpsMonoSiren,
  "audio-16khz-16kbps-mono-siren":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz16KbpsMonoSiren,
  "audio-16khz-32kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
  "audio-16khz-128kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3,
  "audio-16khz-64kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz64KBitRateMonoMp3,
  "audio-24khz-48kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3,
  "audio-24khz-96kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3,
  "audio-24khz-160kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
  "raw-16khz-16bit-mono-truesilk":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoTrueSilk,
  "riff-16khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm,
  "riff-8khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff8Khz16BitMonoPcm,
  "riff-24khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm,
  "riff-8khz-8bit-mono-mulaw":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff8Khz8BitMonoMULaw,
  "raw-16khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm,
  "raw-24khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm,
  "raw-8khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw8Khz16BitMonoPcm,
  "ogg-16khz-16bit-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Ogg16Khz16BitMonoOpus,
  "ogg-24khz-16bit-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Ogg24Khz16BitMonoOpus,
  "raw-48khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw48Khz16BitMonoPcm,
  "riff-48khz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff48Khz16BitMonoPcm,
  "audio-48khz-96kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio48Khz96KBitRateMonoMp3,
  "audio-48khz-192kbitrate-mono-mp3":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3,
  "ogg-48khz-16bit-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Ogg48Khz16BitMonoOpus,
  "webm-16khz-16bit-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Webm16Khz16BitMonoOpus,
  "webm-24khz-16bit-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Webm24Khz16BitMonoOpus,
  "webm-24khz-16bit-24kbps-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Webm24Khz16Bit24KbpsMonoOpus,
  "raw-24khz-16bit-mono-truesilk":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoTrueSilk,
  "raw-8khz-8bit-mono-alaw":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoALaw,
  "riff-8khz-8bit-mono-alaw":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff8Khz8BitMonoALaw,
  "audio-16khz-16bit-32kbps-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz16Bit32KbpsMonoOpus,
  "audio-24khz-16bit-48kbps-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz16Bit48KbpsMonoOpus,
  "audio-24khz-16bit-24kbps-mono-opus":
    SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz16Bit24KbpsMonoOpus,
  "raw-22050hz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw22050Hz16BitMonoPcm,
  "riff-22050hz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff22050Hz16BitMonoPcm,
  "raw-44100hz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Raw44100Hz16BitMonoPcm,
  "riff-44100hz-16bit-mono-pcm":
    SpeechSDK.SpeechSynthesisOutputFormat.Riff44100Hz16BitMonoPcm,
  "amr-wb-16000hz": SpeechSDK.SpeechSynthesisOutputFormat.AmrWb16000Hz,
  "g722-16khz-64kbps": SpeechSDK.SpeechSynthesisOutputFormat.G72216Khz64Kbps,
};

function resolveEndpoint(config: TtsConfig): string {
  return config.endpoint.replace(
    /\{region\}/g,
    encodeURIComponent(config.region),
  );
}

function resolveOutputFormat(
  outputFormat: string,
): SpeechSDK.SpeechSynthesisOutputFormat {
  const resolvedFormat = OUTPUT_FORMATS[outputFormat];
  if (resolvedFormat === undefined) {
    throw new Error(`Unsupported Azure Speech output format: ${outputFormat}`);
  }

  return resolvedFormat;
}

function createSpeechConfig(config: TtsConfig): SpeechSDK.SpeechConfig {
  const speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(
    new URL(resolveEndpoint(config)),
    config.subscriptionKey,
  );
  speechConfig.speechSynthesisOutputFormat = resolveOutputFormat(
    config.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
  );
  return speechConfig;
}

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

function createSpeechSdkError(error: unknown): AzureTtsSdkError {
  const message = error instanceof Error ? error.message : String(error);
  return new AzureTtsSdkError(message);
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

export class AzureTtsClient {
  readonly #options: AzureTtsClientOptions;

  constructor(options: AzureTtsClientOptions) {
    this.#options = options;
  }

  async synthesize(ssml: string): Promise<ArrayBuffer> {
    return synthesizeSpeech(ssml, {
      endpoint:
        this.#options.endpoint ??
        `https://${this.#options.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      subscriptionKey: this.#options.subscriptionKey,
      region: this.#options.region,
      outputFormat: this.#options.outputFormat,
    });
  }
}
