import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import Editor from "@monaco-editor/react";
import { buildSsml } from "@ssml-builder/ssml-core";
import type {
  ProsodyElement,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  VoiceElement,
} from "@ssml-builder/ssml-core";

const DEFAULT_VOICE = "en-US-JennyNeural";
const DEFAULT_PITCH = "0st";
const DEFAULT_RATE = "medium";
const DEFAULT_VOLUME = "medium";
const RATE_OPTIONS = ["x-slow", "slow", "medium", "fast", "x-fast"] as const;
const VOLUME_OPTIONS = [
  "silent",
  "x-soft",
  "soft",
  "medium",
  "loud",
  "x-loud",
] as const;

export interface SsmlEditorProps {
  document: SsmlDocument;
  onChange?: (document: SsmlDocument) => void;
  onSsmlChange?: (xml: string) => void;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    gap: "1rem",
    padding: "1rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  heading: {
    margin: 0,
    fontSize: "1.125rem",
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
    gap: "1rem",
  },
  field: {
    display: "grid",
    gap: "0.375rem",
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "2.25rem",
    padding: "0.375rem 0.5rem",
    border: "1px solid #9ca3af",
    borderRadius: "0.25rem",
    font: "inherit",
  },
  range: {
    width: "100%",
  },
  editor: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "8rem",
    border: "1px solid #9ca3af",
    borderRadius: "0.25rem",
    overflow: "hidden",
  },
  preview: {
    margin: 0,
    padding: "0.75rem",
    overflowX: "auto",
    borderRadius: "0.25rem",
    backgroundColor: "#f3f4f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "pre-wrap",
  },
};

function isSsmlElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function isVoice(element: SsmlElement): element is VoiceElement {
  return element.type === "voice";
}

function isProsody(element: SsmlElement): element is ProsodyElement {
  return element.type === "prosody";
}

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return (
    document.children ??
    (document.content === undefined ? [] : [document.content])
  );
}

function findFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
): T | undefined {
  for (const node of nodes) {
    if (!isSsmlElement(node)) {
      continue;
    }

    if (predicate(node)) {
      return node;
    }

    const child = findFirstElement(node.children ?? [], predicate);
    if (child) {
      return child;
    }
  }

  return undefined;
}

function updateFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (element: SsmlElement) => element is T,
  update: (element: T) => SsmlElement,
): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || !isSsmlElement(node)) {
      return node;
    }

    if (predicate(node)) {
      updated = true;
      return update(node);
    }

    if (node.children) {
      const result = updateFirstElement(node.children, predicate, update);
      if (result.updated) {
        updated = true;
        return { ...node, children: result.nodes };
      }
    }

    return node;
  });

  return { nodes: nextNodes, updated };
}

function withChildren(
  document: SsmlDocument,
  children: SsmlNode[],
): SsmlDocument {
  const nextDocument: SsmlDocument = { ...document, children };
  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }
  return nextDocument;
}

function createProsody(
  children: SsmlNode[],
  updates: Partial<ProsodyElement> = {},
): ProsodyElement {
  return {
    type: "prosody",
    rate: DEFAULT_RATE,
    pitch: DEFAULT_PITCH,
    volume: DEFAULT_VOLUME,
    ...updates,
    children: children.length > 0 ? children : [""],
  };
}

function updateVoiceName(document: SsmlDocument, name: string): SsmlDocument {
  const children = getDocumentChildren(document);
  const result = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    name,
  }));
  if (result.updated) {
    return withChildren(document, result.nodes);
  }

  return withChildren(document, [
    {
      type: "voice",
      name,
      children: [createProsody(children)],
    },
  ]);
}

function updateProsody(
  document: SsmlDocument,
  updates: Partial<ProsodyElement>,
): SsmlDocument {
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    ...updates,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: [createProsody(voice.children ?? [], updates)],
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, [
    {
      type: "voice",
      name: DEFAULT_VOICE,
      children: [createProsody(children, updates)],
    },
  ]);
}

function getTextContent(nodes: SsmlNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") {
        return node;
      }
      if (node.type === "text") {
        return node.value;
      }
      return getTextContent(node.children ?? []);
    })
    .join("");
}

function getEditableText(document: SsmlDocument): string {
  const children = getDocumentChildren(document);
  const element =
    findFirstElement(children, isProsody) ??
    findFirstElement(children, isVoice);
  return getTextContent(element?.children ?? children);
}

function updateText(document: SsmlDocument, value: string): SsmlDocument {
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    children: [value],
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: [value],
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, [value]);
}

function getPitchValue(pitch: string | number | undefined): number {
  const match = String(pitch ?? DEFAULT_PITCH).match(
    /^([+-]?\d+(?:\.\d+)?)st$/,
  );
  const value = match ? Number(match[1]) : 0;
  return Math.min(12, Math.max(-12, value));
}

function formatPitch(value: number): string {
  return `${value > 0 ? "+" : ""}${value}st`;
}

export function SsmlEditor({
  document,
  onChange,
  onSsmlChange,
}: SsmlEditorProps): ReactElement {
  const [draftDocument, setDraftDocument] = useState(document);

  useEffect(() => {
    setDraftDocument(document);
  }, [document]);

  const children = getDocumentChildren(draftDocument);
  const voice = findFirstElement(children, isVoice);
  const prosody = findFirstElement(children, isProsody);
  const voiceName = voice?.name ?? DEFAULT_VOICE;
  const pitch = String(prosody?.pitch ?? DEFAULT_PITCH);
  const pitchValue = getPitchValue(prosody?.pitch);
  const rate = String(prosody?.rate ?? DEFAULT_RATE);
  const volume = String(prosody?.volume ?? DEFAULT_VOLUME);
  const text = getEditableText(draftDocument);

  const commit = (nextDocument: SsmlDocument): void => {
    setDraftDocument(nextDocument);
    onChange?.(nextDocument);
    onSsmlChange?.(buildSsml(nextDocument));
  };

  return (
    <section style={styles.container} aria-label="SSML editor">
      <h2 style={styles.heading}>SSML Editor</h2>
      <div style={styles.controls}>
        <label style={styles.field} htmlFor="ssml-editor-voice">
          Voice
          <input
            id="ssml-editor-voice"
            style={styles.input}
            type="text"
            value={voiceName}
            onChange={(event) =>
              commit(updateVoiceName(draftDocument, event.target.value))
            }
          />
        </label>
        <label style={styles.field} htmlFor="ssml-editor-rate">
          Rate
          <select
            id="ssml-editor-rate"
            style={styles.input}
            value={rate}
            onChange={(event) =>
              commit(updateProsody(draftDocument, { rate: event.target.value }))
            }
          >
            {!([...RATE_OPTIONS] as string[]).includes(rate) && (
              <option value={rate}>{rate}</option>
            )}
            {RATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field} htmlFor="ssml-editor-volume">
          Volume
          <select
            id="ssml-editor-volume"
            style={styles.input}
            value={volume}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, { volume: event.target.value }),
              )
            }
          >
            {!([...VOLUME_OPTIONS] as string[]).includes(volume) && (
              <option value={volume}>{volume}</option>
            )}
            {VOLUME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div style={styles.field}>
          <label htmlFor="ssml-editor-pitch">Pitch: {pitch}</label>
          <input
            id="ssml-editor-pitch"
            style={styles.range}
            type="range"
            min="-12"
            max="12"
            step="1"
            value={pitchValue}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, {
                  pitch: formatPitch(Number(event.target.value)),
                }),
              )
            }
          />
          <input
            aria-label="Pitch value"
            style={styles.input}
            type="text"
            value={pitch}
            onChange={(event) =>
              commit(
                updateProsody(draftDocument, { pitch: event.target.value }),
              )
            }
          />
        </div>
      </div>
      <label style={styles.field}>
        Text
        <div style={styles.editor}>
          <Editor
            height="8rem"
            language="xml"
            value={text}
            onChange={(value) => commit(updateText(draftDocument, value ?? ""))}
          />
        </div>
      </label>
      <details>
        <summary>Generated SSML</summary>
        <pre style={styles.preview}>{buildSsml(draftDocument)}</pre>
      </details>
    </section>
  );
}
