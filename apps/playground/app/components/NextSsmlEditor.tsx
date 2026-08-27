"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import type { SsmlEditorProps } from "@ssml-builder-js/ssml-editor-react";

const ClientSsmlEditor = dynamic(
  () => import("@ssml-builder-js/ssml-editor-react").then(({ SsmlEditor }) => SsmlEditor),
  { ssr: false },
);

export type NextSsmlEditorProps = Omit<SsmlEditorProps, "onPreviewSelection"> & {
  onPreviewSelection?: SsmlEditorProps["onPreviewSelection"];
};

/** App Router/Pages Router-safe wrapper. Azure credentials never enter this client component. */
export function NextSsmlEditor({ onPreviewSelection, ...props }: NextSsmlEditorProps) {
  const audioUrl = useRef<string | null>(null);

  const previewSelection = async (ssml: string): Promise<void> => {
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssml }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Speech synthesis failed");
    const nextUrl = URL.createObjectURL(await response.blob());
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = nextUrl;
    const audio = new Audio(nextUrl);
    await audio.play();
    onPreviewSelection?.(ssml);
  };

  return <ClientSsmlEditor {...props} onPreviewSelection={previewSelection} />;
}
