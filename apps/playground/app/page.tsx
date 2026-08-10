"use client";

import { useState } from "react";
import { buildSsml } from "@ssml-builder/ssml-core";
import type { SsmlDocument } from "@ssml-builder/ssml-core";
import { SsmlEditor } from "@ssml-builder/ssml-editor-react";

const initialDocument: SsmlDocument = {
  type: "speak",
  version: "1.0",
  lang: "en-US",
  children: [
    {
      type: "voice",
      name: "en-US-JennyNeural",
      children: [
        {
          type: "prosody",
          rate: "medium",
          pitch: "0st",
          volume: "medium",
          children: ["Welcome to the SSML Builder playground."],
        },
      ],
    },
  ],
};

export default function Home() {
  const [document, setDocument] = useState<SsmlDocument>(initialDocument);
  const ssml = buildSsml(document);

  return (
    <main className="playground">
      <header className="intro">
        <p className="eyebrow">SSML Builder</p>
        <h1>Playground</h1>
        <p>
          Edit the sample document below to verify the SSML editor and core
          package together.
        </p>
      </header>
      <SsmlEditor document={document} onChange={setDocument} />
      <section className="output" aria-labelledby="generated-ssml-heading">
        <h2 id="generated-ssml-heading">Generated SSML</h2>
        <pre>
          <code>{ssml}</code>
        </pre>
      </section>
    </main>
  );
}
