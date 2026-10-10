import { useCallback, useEffect, useRef, useState } from "react";
import { createCaptionTrack, getErrorMessage, inspectProject, projectFromDraft } from "../studio";
import type { PreviewScope } from "../studio";

export type AzureConfiguration = "checking" | "configured" | "missing" | "error";

export interface AudioPreviewRequest {
  ssml: string;
  sourceSsml: string;
  title: string;
  scope: PreviewScope;
}

export interface AudioPreviewResult extends AudioPreviewRequest {
  url: string;
  captionTrack: string;
  language: string;
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return `Speech request failed (${response.status}).`;
}

export function useAudioPreview() {
  const [configuration, setConfiguration] = useState<AzureConfiguration>("checking");
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [result, setResult] = useState<AudioPreviewResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configurationController = useRef<AbortController | null>(null);
  const synthesisController = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);

  const checkConfiguration = useCallback(async (): Promise<void> => {
    configurationController.current?.abort();
    const controller = new AbortController();
    configurationController.current = controller;
    setConfiguration("checking");
    setConfigurationError(null);
    try {
      const response = await fetch("/api/synthesize", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Configuration request failed (${response.status}).`);
      const body: unknown = await response.json();
      if (
        body === null ||
        typeof body !== "object" ||
        !("configured" in body) ||
        typeof body.configured !== "boolean"
      ) {
        throw new Error("The server returned an invalid configuration response.");
      }
      if (!controller.signal.aborted) setConfiguration(body.configured ? "configured" : "missing");
    } catch (error) {
      if (controller.signal.aborted) return;
      setConfiguration("error");
      setConfigurationError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void checkConfiguration();
    return () => {
      configurationController.current?.abort();
      synthesisController.current?.abort();
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    };
  }, [checkConfiguration]);

  const generate = useCallback(async (request: AudioPreviewRequest): Promise<void> => {
    synthesisController.current?.abort();
    const controller = new AbortController();
    synthesisController.current = controller;
    setGenerating(true);
    setError(null);
    try {
      const project = projectFromDraft({ title: request.title, ssml: request.ssml });
      const inspection = inspectProject(project);
      if (!inspection.canSynthesize || !project.document) {
        throw new Error(
          inspection.syntaxError?.message ?? inspection.diagnostics[0]?.message ?? "The script is empty.",
        );
      }
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssml: request.ssml }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (blob.size === 0 || blob.type.split(";")[0] !== "audio/mpeg") {
        throw new Error("The server did not return a playable MP3.");
      }
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = url;
      setResult({
        ...request,
        url,
        captionTrack: createCaptionTrack(request.ssml),
        language: project.document.lang,
      });
    } catch (error) {
      if (!controller.signal.aborted) setError(getErrorMessage(error));
    } finally {
      if (synthesisController.current === controller) {
        synthesisController.current = null;
        setGenerating(false);
      }
    }
  }, []);

  const cancel = useCallback((): void => {
    synthesisController.current?.abort();
    synthesisController.current = null;
    setGenerating(false);
  }, []);

  return {
    configuration,
    configurationError,
    result,
    generating,
    error,
    generate,
    cancel,
    checkConfiguration,
  };
}
