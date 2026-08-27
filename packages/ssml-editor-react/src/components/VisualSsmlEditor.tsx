import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  buildSsml,
  validateAzureSsml,
  type SsmlDocument,
  type SsmlElement,
  type SsmlNode,
} from "@ssml-builder-js/ssml-core";

export interface VisualSsmlEditorProps {
  document: SsmlDocument;
  readOnly?: boolean;
  onChange?: (document: SsmlDocument) => void;
  onPreviewSelection?: (ssml: string) => void;
}

interface TextLeaf {
  path: number[];
  value: string;
  ancestors: string[];
}

function isElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function elementLabel(element: SsmlElement): string {
  return element.type === "custom" || element.type === "element" ? element.name : element.type;
}

function collectTextLeaves(nodes: SsmlNode[], path: number[] = [], ancestors: string[] = []): TextLeaf[] {
  return nodes.flatMap((node, index) => {
    const currentPath = [...path, index];
    if (typeof node === "string") return [{ ancestors, path: currentPath, value: node }];
    if (node.type === "text") return [{ ancestors, path: currentPath, value: node.value }];
    return collectTextLeaves(node.children ?? [], currentPath, [...ancestors, elementLabel(node)]);
  });
}

function updateNodesAtPath(
  nodes: SsmlNode[],
  path: number[],
  update: (node: SsmlNode) => SsmlNode | SsmlNode[],
): SsmlNode[] {
  if (path.length === 0) return nodes;
  const [index, ...rest] = path;
  return nodes.flatMap((node, nodeIndex) => {
    if (nodeIndex !== index) return [node];
    if (rest.length === 0) {
      const next = update(node);
      return Array.isArray(next) ? next : [next];
    }
    if (!isElement(node)) return [node];
    return [{ ...node, children: updateNodesAtPath(node.children ?? [], rest, update) }];
  });
}

function updateTextAtPath(document: SsmlDocument, path: number[], value: string): SsmlDocument {
  return { ...document, children: updateNodesAtPath(document.children ?? [], path, () => value) };
}

function wrapTextAtPath(
  document: SsmlDocument,
  path: number[],
  start: number,
  end: number,
  tag: SsmlElement["type"],
  attributes: Record<string, string>,
): SsmlDocument {
  return {
    ...document,
    children: updateNodesAtPath(document.children ?? [], path, (node) => {
      const value = typeof node === "string" ? node : node.type === "text" ? node.value : "";
      if (!value || start === end) return node;
      if (tag === "break") {
        return [
          value.slice(0, start),
          { type: tag, attributes, children: [] } as SsmlElement,
          value.slice(start),
        ].filter((part) => (typeof part === "string" ? part.length > 0 : true));
      }
      const selected = value.slice(start, end);
      const wrapped = { type: tag, attributes, children: [selected] } as SsmlElement;
      return [value.slice(0, start), wrapped, value.slice(end)].filter((part) =>
        typeof part === "string" ? part.length > 0 : true,
      );
    }),
  };
}

function TreeNode({
  node,
  path,
  selectedPath,
  onSelect,
}: {
  node: SsmlNode;
  path: number[];
  selectedPath: number[] | null;
  onSelect: (path: number[]) => void;
}): ReactElement | null {
  if (!isElement(node)) return null;
  const name = elementLabel(node);
  const isSelected = selectedPath?.join(".") === path.join(".");
  return (
    <li>
      <button type="button" aria-current={isSelected ? "true" : undefined} onClick={() => onSelect(path)}>
        {`<${name}>`}
      </button>
      {(node.children ?? []).length > 0 && (
        <ul>
          {node.children?.map((child, index) => (
            <TreeNode
              key={`${path.join(".")}/${isElement(child) ? elementLabel(child) : JSON.stringify(child)}`}
              node={child}
              path={[...path, index]}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function VisualSsmlEditor({
  document,
  readOnly = false,
  onChange,
  onPreviewSelection,
}: VisualSsmlEditorProps): ReactElement {
  const [selectedPath, setSelectedPath] = useState<number[] | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const textLeaves = useMemo(() => collectTextLeaves(document.children ?? []), [document]);
  const selectedLeaf = textLeaves.find((leaf) => leaf.path.join(".") === selectedPath?.join(".")) ?? textLeaves[0];
  const diagnostics = useMemo(() => validateAzureSsml(buildSsml(document)), [document]);
  const commit = (nextDocument: SsmlDocument): void => onChange?.(nextDocument);

  const applyWrapper = (tag: SsmlElement["type"], attributes: Record<string, string>): void => {
    if (readOnly || !selectedLeaf) return;
    const start = selection.start === selection.end ? 0 : selection.start;
    const end = selection.start === selection.end ? selectedLeaf.value.length : selection.end;
    commit(wrapTextAtPath(document, selectedLeaf.path, start, end, tag, attributes));
  };

  return (
    <div className="ssml-editor-visual" data-ssml-editor-visual="">
      <fieldset className="ssml-editor-visual-breadcrumb">
        <legend>SSML structure breadcrumb</legend>
        <span>&lt;speak&gt;</span>
        {selectedLeaf?.ancestors.map((ancestor, index) => (
          <span key={selectedLeaf?.ancestors.slice(0, index + 1).join("/")}> / &lt;{ancestor}&gt;</span>
        ))}
        {selectedPath && (
          <button type="button" onClick={() => setSelectedPath(null)}>
            Clear parent
          </button>
        )}
      </fieldset>
      {diagnostics.length > 0 && (
        <div role="alert" aria-invalid="true" className="ssml-editor-visual-errors">
          {diagnostics.map((diagnostic) => (
            <div key={`${diagnostic.code}-${diagnostic.message}`}>{diagnostic.message}</div>
          ))}
        </div>
      )}
      <div className="ssml-editor-visual-layout">
        <nav aria-label="SSML structure tree" className="ssml-editor-visual-tree">
          <strong>Structure</strong>
          <ul>
            {document.children?.map((node, index) => (
              <TreeNode
                key={isElement(node) ? elementLabel(node) : JSON.stringify(node)}
                node={node}
                path={[index]}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ))}
          </ul>
        </nav>
        <div className="ssml-editor-visual-form">
          {selectedLeaf ? (
            <>
              <label>
                Text
                <textarea
                  value={selectedLeaf.value}
                  readOnly={readOnly}
                  onSelect={(event) =>
                    setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })
                  }
                  onChange={(event) => commit(updateTextAtPath(document, selectedLeaf.path, event.target.value))}
                />
              </label>
              <fieldset className="ssml-editor-visual-actions">
                <legend>Apply SSML formatting</legend>
                <button type="button" disabled={readOnly} onClick={() => applyWrapper("prosody", { rate: "slow" })}>
                  Rate
                </button>
                <button type="button" disabled={readOnly} onClick={() => applyWrapper("prosody", { pitch: "high" })}>
                  Pitch
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => applyWrapper("mstts:express-as", { style: "cheerful" })}
                >
                  Emotion
                </button>
                <button type="button" disabled={readOnly} onClick={() => applyWrapper("break", { time: "500ms" })}>
                  Pause
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => applyWrapper("phoneme", { alphabet: "ipa", ph: selectedLeaf.value })}
                >
                  Pronunciation
                </button>
                {onPreviewSelection && (
                  <button
                    type="button"
                    onClick={() => onPreviewSelection(buildSsml({ ...document, children: [selectedLeaf.value] }))}
                  >
                    Preview selection
                  </button>
                )}
              </fieldset>
            </>
          ) : (
            <p>Select an element or text node to edit it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
