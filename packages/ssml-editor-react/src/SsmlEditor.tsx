import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { buildSsml, parseSsml } from "@ssml-builder/ssml-core";
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
const SSML_INSERTIONS = [
  {
    label: "間 (break)",
    title: 'Insert a 500ms pause with <break time="500ms"/>',
    prefix: '<break time="500ms"/>',
    suffix: "",
    mode: "insert",
  },
  {
    label: "強調 (emphasis)",
    title: 'Wrap the selection with <emphasis level="strong">',
    prefix: '<emphasis level="strong">',
    suffix: "</emphasis>",
    mode: "wrap",
  },
  {
    label: "速度 (prosody)",
    title: 'Wrap the selection with <prosody rate="fast">',
    prefix: '<prosody rate="fast">',
    suffix: "</prosody>",
    mode: "wrap",
  },
  {
    label: "高さ (prosody)",
    title: 'Wrap the selection with <prosody pitch="+2st">',
    prefix: '<prosody pitch="+2st">',
    suffix: "</prosody>",
    mode: "wrap",
  },
  {
    label: "音量 (prosody)",
    title: 'Wrap the selection with <prosody volume="loud">',
    prefix: '<prosody volume="loud">',
    suffix: "</prosody>",
    mode: "wrap",
  },
  {
    label: "感情 (express-as)",
    title: 'Wrap the selection with <mstts:express-as style="cheerful">',
    prefix: '<mstts:express-as style="cheerful">',
    suffix: "</mstts:express-as>",
    mode: "wrap",
  },
  {
    label: "読み上げ (say-as)",
    title: 'Wrap the selection with <say-as interpret-as="characters">',
    prefix: '<say-as interpret-as="characters">',
    suffix: "</say-as>",
    mode: "wrap",
  },
  {
    label: "発音 (phoneme)",
    title: 'Wrap the selection with <phoneme alphabet="ipa">',
    prefix: '<phoneme alphabet="ipa" ph="">',
    suffix: "</phoneme>",
    mode: "wrap",
  },
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
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  toolbarButton: {
    minHeight: "2.25rem",
    padding: "0.375rem 0.625rem",
    border: "1px solid #9ca3af",
    borderRadius: "0.25rem",
    color: "#111827",
    backgroundColor: "#f9fafb",
    font: "inherit",
    cursor: "pointer",
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

type MonacoEditor = Parameters<OnMount>[0];
type SsmlInsertion = (typeof SSML_INSERTIONS)[number];

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

function parseEditableText(value: string): SsmlNode[] {
  try {
    const children =
      parseSsml(`<speak version="1.0" xml:lang="en-US">${value}</speak>`)
        .children ?? [];
    return children.some(isSsmlElement) ? children : [value];
  } catch {
    return [value];
  }
}

function serializeEditableText(nodes: SsmlNode[]): string {
  if (nodes.length === 1 && typeof nodes[0] === "string") {
    return nodes[0];
  }

  const xml = buildSsml({
    version: "1.0",
    lang: "en-US",
    children: nodes,
  });
  const contentStart = xml.indexOf(">") + 1;
  return xml.slice(contentStart, -"</speak>".length);
}

function getEditableText(document: SsmlDocument): string {
  const children = getDocumentChildren(document);
  const element =
    findFirstElement(children, isProsody) ??
    findFirstElement(children, isVoice);
  return serializeEditableText(element?.children ?? children);
}

function updateText(document: SsmlDocument, value: string): SsmlDocument {
  const nextChildren = parseEditableText(value);
  const editableChildren = nextChildren.length > 0 ? nextChildren : [value];
  const children = getDocumentChildren(document);
  const prosodyResult = updateFirstElement(children, isProsody, (prosody) => ({
    ...prosody,
    children: editableChildren,
  }));
  if (prosodyResult.updated) {
    return withChildren(document, prosodyResult.nodes);
  }

  const voiceResult = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: editableChildren,
  }));
  if (voiceResult.updated) {
    return withChildren(document, voiceResult.nodes);
  }

  return withChildren(document, editableChildren);
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

function applySsmlInsertion(
  editor: MonacoEditor,
  insertion: SsmlInsertion,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return;
  }

  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const selectedText = model.getValueInRange(selection);
  const replacement =
    insertion.mode === "insert"
      ? `${insertion.prefix}${selectedText}`
      : `${insertion.prefix}${selectedText}${insertion.suffix}`;

  editor.pushUndoStop();
  const applied = editor.executeEdits("ssml-toolbar", [
    {
      range: selection,
      text: replacement,
    },
  ]);
  editor.pushUndoStop();
  if (!applied) {
    return;
  }

  const nextSelectionStart = model.getPositionAt(
    startOffset + insertion.prefix.length,
  );
  const nextSelectionEnd = model.getPositionAt(
    endOffset + insertion.prefix.length,
  );
  editor.setSelection({
    selectionStartLineNumber: nextSelectionStart.lineNumber,
    selectionStartColumn: nextSelectionStart.column,
    positionLineNumber: nextSelectionEnd.lineNumber,
    positionColumn: nextSelectionEnd.column,
  });
  editor.focus();
}

export function SsmlEditor({
  document,
  onChange,
  onSsmlChange,
}: SsmlEditorProps): ReactElement {
  const [draftDocument, setDraftDocument] = useState(document);
  const editorRef = useRef<MonacoEditor | null>(null);

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
      <div style={styles.field}>
        <span>Text</span>
        <div style={styles.toolbar} role="toolbar" aria-label="SSML toolbar">
          {SSML_INSERTIONS.map((insertion) => (
            <button
              key={insertion.label}
              type="button"
              style={styles.toolbarButton}
              title={insertion.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (editorRef.current) {
                  applySsmlInsertion(editorRef.current, insertion);
                }
              }}
            >
              {insertion.label}
            </button>
          ))}
        </div>
        <div style={styles.editor}>
          <Editor
            height="8rem"
            language="xml"
            value={text}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            onChange={(value) => commit(updateText(draftDocument, value ?? ""))}
          />
        </div>
      </div>
      <details>
        <summary>Generated SSML</summary>
        <pre style={styles.preview}>{buildSsml(draftDocument)}</pre>
      </details>
    </section>
  );
}
