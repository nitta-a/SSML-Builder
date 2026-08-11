import { buildPartialSsml, buildSsml, parseSsml, validateSsml } from "../../ssml-core/src/index";
import type { SsmlDocument, SsmlElement, SsmlNode } from "../../ssml-core/src/types";
import { expect, test } from "vitest";
import { clearSsmlDocument } from "../src/clearSsmlDocument";
import { formatXmlFragment } from "../src/formatXml";
import { createSsmlInsertionEdit } from "../src/ssmlInsertion";

const EDITABLE_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SUFFIX = "</speak>";
const OPERATION_COUNT = 50;
const SEED = 0x5eed;

type OperationName = "insert-text" | "select-text" | "insert-tag" | "format-xml" | "clear-document";

interface RandomSource {
  next(maximum: number): number;
}

const TAG_TEMPLATES = [
  { prefix: '<break time="500ms"/>', suffix: "", mode: "insert" as const },
  { prefix: '<prosody rate="slow">', suffix: "</prosody>", mode: "wrap" as const },
  { prefix: '<mstts:express-as style="cheerful">', suffix: "</mstts:express-as>", mode: "wrap" as const },
];

function createRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next(maximum) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state % maximum;
    },
  };
}

function getChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function isElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string";
}

function findFirstElement(nodes: SsmlNode[], type: SsmlElement["type"]): SsmlElement | undefined {
  for (const node of nodes) {
    if (isElement(node) && node.type === type) {
      return node;
    }
    if (isElement(node)) {
      const result = findFirstElement(node.children ?? [], type);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}

function serializeChildren(children: SsmlNode[], lang: string): string {
  if (children.length === 1 && typeof children[0] === "string") {
    return children[0];
  }

  const xml = buildSsml({
    type: "speak",
    version: "1.0",
    lang,
    children,
  });
  return xml.slice(xml.indexOf(">") + 1, -EDITABLE_SUFFIX.length);
}

function getEditableText(document: SsmlDocument): string {
  const children = getChildren(document);
  const editableElement = findFirstElement(children, "prosody") ?? findFirstElement(children, "voice");
  return serializeChildren(editableElement?.children ?? children, document.lang);
}

function parseEditableText(value: string): SsmlNode[] {
  try {
    const children = parseSsml(`${EDITABLE_PREFIX}${value}${EDITABLE_SUFFIX}`).children ?? [];
    return children.some(isElement) ? children : [value];
  } catch {
    return [value];
  }
}

function replaceFirstElement(
  nodes: SsmlNode[],
  type: SsmlElement["type"],
  children: SsmlNode[],
): { nodes: SsmlNode[]; replaced: boolean } {
  const nextNodes = nodes.map((node) => {
    if (!isElement(node)) {
      return node;
    }
    if (node.type === type) {
      return { ...node, children };
    }
    if (!node.children) {
      return node;
    }
    const result = replaceFirstElement(node.children, type, children);
    if (!result.replaced) {
      return node;
    }
    return { ...node, children: result.nodes };
  });

  return {
    nodes: nextNodes,
    replaced: nextNodes.some((node, index) => node !== nodes[index]),
  };
}

function updateEditableText(document: SsmlDocument, value: string): SsmlDocument {
  const children = parseEditableText(value);
  const editableChildren = children.length > 0 ? children : [value];
  const currentChildren = getChildren(document);
  const prosodyResult = replaceFirstElement(currentChildren, "prosody", editableChildren);
  if (prosodyResult.replaced) {
    return { ...document, children: prosodyResult.nodes };
  }

  const voiceResult = replaceFirstElement(currentChildren, "voice", editableChildren);
  if (voiceResult.replaced) {
    return { ...document, children: voiceResult.nodes };
  }

  return { ...document, children: editableChildren };
}

class RandomizedEditor {
  private document: SsmlDocument = parseSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello world</voice></speak>',
  );
  private value = getEditableText(this.document);
  private selectionStart = 0;
  private selectionEnd = 0;

  getFullSsml(): string {
    return buildSsml(updateEditableText(this.document, this.value));
  }

  getSelectedSsml(): string | null {
    if (this.selectionStart === this.selectionEnd) {
      return null;
    }

    return buildPartialSsml(this.value.slice(this.selectionStart, this.selectionEnd), {
      lang: this.document.lang,
    });
  }

  insertText(random: RandomSource): void {
    const position = random.next(this.value.length + 1);
    const text = ["a", " & ", "b", " < ", "c"][random.next(5)];
    this.setValue(`${this.value.slice(0, position)}${text}${this.value.slice(position)}`);
    this.setSelection(position + text.length, position + text.length);
  }

  selectText(random: RandomSource): void {
    const start = random.next(this.value.length + 1);
    const end = start + random.next(this.value.length - start + 1);
    this.setSelection(start, end);
  }

  insertTag(random: RandomSource): void {
    const template = TAG_TEMPLATES[random.next(TAG_TEMPLATES.length)];
    const edit = createSsmlInsertionEdit(this.value, this.selectionStart, this.selectionEnd, template);
    this.setValue(
      `${this.value.slice(0, this.selectionStart)}${edit.replacement}${this.value.slice(this.selectionEnd)}`,
    );
    this.setSelection(
      Math.min(this.value.length, this.selectionStart + edit.selectionOffset),
      Math.min(this.value.length, this.selectionEnd + edit.selectionOffset),
    );
  }

  formatXml(): void {
    this.setValue(formatXmlFragment(this.value));
  }

  clearDocument(): void {
    this.document = clearSsmlDocument(this.document);
    this.value = getEditableText(this.document);
    this.setSelection(0, 0);
  }

  private setValue(value: string): void {
    this.document = updateEditableText(this.document, value);
    this.value = getEditableText(this.document);
  }

  private setSelection(start: number, end: number): void {
    this.selectionStart = Math.max(0, Math.min(start, this.value.length));
    this.selectionEnd = Math.max(this.selectionStart, Math.min(end, this.value.length));
  }
}

function createOperationPlan(random: RandomSource): OperationName[] {
  const operations: OperationName[] = ["insert-text", "select-text", "insert-tag", "format-xml", "clear-document"];
  const allOperations: OperationName[] = [...operations];

  while (allOperations.length < OPERATION_COUNT) {
    allOperations.push(operations[random.next(operations.length)]);
  }

  for (let index = allOperations.length - 1; index > 0; index -= 1) {
    const swapIndex = random.next(index + 1);
    [allOperations[index], allOperations[swapIndex]] = [allOperations[swapIndex], allOperations[index]];
  }

  return allOperations;
}

function checkInvariants(editor: RandomizedEditor): void {
  const ssml = editor.getFullSsml();
  parseSsml(ssml);
  expect(validateSsml(ssml)).toBeNull();

  const selectedSsml = editor.getSelectedSsml();
  expect(selectedSsml === null || typeof selectedSsml === "string").toBe(true);
  if (selectedSsml !== null) {
    parseSsml(selectedSsml);
  }
}

function logFailure(editor: RandomizedEditor, step: number, operation: OperationName): void {
  let ssml = "<unavailable>";
  try {
    ssml = editor.getFullSsml();
  } catch {
    // Keep the operation context when the editor cannot produce SSML for diagnostics.
  }
  console.error(`Random editor invariant failed at step ${step} (${operation}), seed ${SEED}.\nSSML:\n${ssml}`);
}

test("preserves SSML invariants during randomized editor operations", () => {
  const random = createRandomSource(SEED);
  const editor = new RandomizedEditor();

  for (const [index, operation] of createOperationPlan(random).entries()) {
    const step = index + 1;
    try {
      switch (operation) {
        case "insert-text":
          editor.insertText(random);
          break;
        case "select-text":
          editor.selectText(random);
          break;
        case "insert-tag":
          editor.insertTag(random);
          break;
        case "format-xml":
          editor.formatXml();
          break;
        case "clear-document":
          editor.clearDocument();
          break;
      }

      checkInvariants(editor);
    } catch (error) {
      logFailure(editor, step, operation);
      throw error;
    }
  }
});
