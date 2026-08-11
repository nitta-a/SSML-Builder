import { buildPartialSsml, buildSsml, parseSsml, validateSsml } from "../../ssml-core/src/index";
import type { SsmlDocument, SsmlElement, SsmlNode } from "../../ssml-core/src/types";
import fc, { type Command } from "fast-check";
import { expect, test } from "vitest";
import { clearSsmlDocument } from "../src/clearSsmlDocument";
import { formatXml, formatXmlFragment } from "../src/formatXml";
import { createSsmlInsertionEdit, type SsmlInsertionTemplate } from "../src/ssmlInsertion";

const EDITABLE_PREFIX = '<speak version="1.0" xml:lang="en-US">';
const EDITABLE_SUFFIX = "</speak>";
const OPERATION_COUNT = 50;
const NUM_RUNS = 100;
const SEED = 0x5eed;
const MAX_GENERATED_OFFSET = 64;

type OperationName = "insert-text" | "delete-text" | "select-text" | "insert-tag" | "format-xml" | "clear-document";

const TAG_TEMPLATES: readonly SsmlInsertionTemplate[] = [
  { prefix: '<break time="500ms"/>', suffix: "", mode: "insert" },
  { prefix: '<prosody rate="slow">', suffix: "</prosody>", mode: "wrap" },
  { prefix: '<mstts:express-as style="cheerful">', suffix: "</mstts:express-as>", mode: "wrap" },
];

const asciiTextArbitrary = fc
  .array(fc.constantFrom(...Array.from("abcXYZ0123 .,!?")), { minLength: 1, maxLength: 16 })
  .map((characters) => characters.join(""));
const japaneseTextArbitrary = fc
  .array(fc.constantFrom(...Array.from("日本語こんにちは世界音声")), { minLength: 1, maxLength: 10 })
  .map((characters) => characters.join(""));
const reservedXmlTextArbitrary = fc
  .array(fc.constantFrom("&", "<", ">", "&amp;", "&lt;", "&gt;"), { minLength: 1, maxLength: 8 })
  .map((parts) => parts.join(""));
const incompleteXmlTagArbitrary = fc.constantFrom(
  "<",
  "</",
  "<voice",
  "<prosody rate=\"slow\"",
  "<mstts:express-as style=\"cheerful\"",
  "<break",
  "<voice><prosody>",
  "<speak><voice>日本語",
);
const insertionTextArbitrary = fc.oneof(
  asciiTextArbitrary,
  japaneseTextArbitrary,
  reservedXmlTextArbitrary,
  incompleteXmlTagArbitrary,
);

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

function createInitialDocument(): SsmlDocument {
  return parseSsml(
    '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello world</voice></speak>',
  );
}

interface EditorModel {
  document: SsmlDocument;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  operationLog: string[];
}

function createModel(): EditorModel {
  const document = createInitialDocument();
  return {
    document,
    value: getEditableText(document),
    selectionStart: 0,
    selectionEnd: 0,
    operationLog: [],
  };
}

function setModelValue(model: EditorModel, value: string): void {
  model.document = updateEditableText(model.document, value);
  model.value = getEditableText(model.document);
}

function createInsertionResult(
  source: string,
  start: number,
  end: number,
  template: SsmlInsertionTemplate,
): { value: string; selectionStart: number; selectionEnd: number } {
  const edit = createSsmlInsertionEdit(source, start, end, template);
  return {
    value: `${source.slice(0, start)}${edit.replacement}${source.slice(end)}`,
    selectionStart: Math.min(source.length + edit.replacement.length - (end - start), start + edit.selectionOffset),
    selectionEnd: Math.min(source.length + edit.replacement.length - (end - start), end + edit.selectionOffset),
  };
}

class RandomizedEditor {
  private document = createInitialDocument();
  private value = getEditableText(this.document);
  private selectionStart = 0;
  private selectionEnd = 0;

  getFullSsml(): string {
    try {
      return buildSsml(updateEditableText(this.document, this.value));
    } catch {
      return this.getFallbackSsml();
    }
  }

  getFallbackSsml(): string {
    return buildSsml({
      type: "speak",
      version: "1.0",
      lang: this.document.lang,
      children: [{ type: "text", value: this.value }],
    });
  }

  getValue(): string {
    return this.value;
  }

  getSelection(): { start: number; end: number } {
    return { start: this.selectionStart, end: this.selectionEnd };
  }

  getSelectedSsml(): string | null {
    if (this.selectionStart === this.selectionEnd) {
      return null;
    }

    return buildPartialSsml(this.value.slice(this.selectionStart, this.selectionEnd), {
      lang: this.document.lang,
    });
  }

  insertText(position: number, text: string): void {
    this.setValue(`${this.value.slice(0, position)}${text}${this.value.slice(position)}`);
    this.setSelection(position + text.length, position + text.length);
  }

  deleteText(start: number, end: number): void {
    this.setValue(`${this.value.slice(0, start)}${this.value.slice(end)}`);
    this.setSelection(start, start);
  }

  selectText(start: number, end: number): void {
    this.setSelection(start, end);
  }

  insertTag(start: number, end: number, template: SsmlInsertionTemplate): void {
    const result = createInsertionResult(this.value, start, end, template);
    this.setValue(result.value);
    this.setSelection(result.selectionStart, result.selectionEnd);
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

function checkInvariants(model: EditorModel, editor: RandomizedEditor): void {
  expect(editor.getValue()).toBe(model.value);
  expect(editor.getSelection()).toEqual({
    start: model.selectionStart,
    end: model.selectionEnd,
  });

  const ssml = editor.getFullSsml();
  try {
    parseSsml(ssml);
  } catch {
    expect(() => parseSsml(editor.getFallbackSsml())).not.toThrow();
  }
  expect(validateSsml(ssml)).toBeNull();

  const formatted = formatXml(ssml);
  expect(formatXml(formatted)).toBe(formatted);

  const selectedSsml = editor.getSelectedSsml();
  expect(selectedSsml === null || typeof selectedSsml === "string").toBe(true);
  if (selectedSsml !== null) {
    expect(() => parseSsml(selectedSsml)).not.toThrow();
  }
}

abstract class EditorCommand implements Command<EditorModel, RandomizedEditor> {
  abstract readonly name: OperationName;

  abstract check(model: Readonly<EditorModel>): boolean;

  abstract applyModel(model: EditorModel): void;

  abstract applyReal(editor: RandomizedEditor): void;

  run(model: EditorModel, editor: RandomizedEditor): void {
    model.operationLog.push(this.toString());
    this.applyModel(model);
    this.applyReal(editor);
    checkInvariants(model, editor);
  }

  abstract toString(): string;
}

class InsertTextCommand extends EditorCommand {
  readonly name = "insert-text" as const;

  constructor(
    private readonly position: number,
    private readonly text: string,
  ) {
    super();
  }

  check(model: Readonly<EditorModel>): boolean {
    return this.position <= model.value.length;
  }

  applyModel(model: EditorModel): void {
    setModelValue(model, `${model.value.slice(0, this.position)}${this.text}${model.value.slice(this.position)}`);
    model.selectionStart = this.position + this.text.length;
    model.selectionEnd = model.selectionStart;
  }

  applyReal(editor: RandomizedEditor): void {
    editor.insertText(this.position, this.text);
  }

  toString(): string {
    return `${this.name}(${this.position}, ${JSON.stringify(this.text)})`;
  }
}

class DeleteTextCommand extends EditorCommand {
  readonly name = "delete-text" as const;

  constructor(
    private readonly start: number,
    private readonly end: number,
  ) {
    super();
  }

  check(model: Readonly<EditorModel>): boolean {
    return this.start <= this.end && this.end <= model.value.length;
  }

  applyModel(model: EditorModel): void {
    setModelValue(model, `${model.value.slice(0, this.start)}${model.value.slice(this.end)}`);
    model.selectionStart = this.start;
    model.selectionEnd = this.start;
  }

  applyReal(editor: RandomizedEditor): void {
    editor.deleteText(this.start, this.end);
  }

  toString(): string {
    return `${this.name}(${this.start}, ${this.end})`;
  }
}

class SelectTextCommand extends EditorCommand {
  readonly name = "select-text" as const;

  constructor(
    private readonly start: number,
    private readonly end: number,
  ) {
    super();
  }

  check(model: Readonly<EditorModel>): boolean {
    return this.start <= this.end && this.end <= model.value.length;
  }

  applyModel(model: EditorModel): void {
    model.selectionStart = this.start;
    model.selectionEnd = this.end;
  }

  applyReal(editor: RandomizedEditor): void {
    editor.selectText(this.start, this.end);
  }

  toString(): string {
    return `${this.name}(${this.start}, ${this.end})`;
  }
}

class InsertTagCommand extends EditorCommand {
  readonly name = "insert-tag" as const;

  constructor(
    private readonly start: number,
    private readonly end: number,
    private readonly template: SsmlInsertionTemplate,
  ) {
    super();
  }

  check(model: Readonly<EditorModel>): boolean {
    return this.start <= this.end && this.end <= model.value.length;
  }

  applyModel(model: EditorModel): void {
    const result = createInsertionResult(model.value, this.start, this.end, this.template);
    setModelValue(model, result.value);
    model.selectionStart = Math.min(model.value.length, result.selectionStart);
    model.selectionEnd = Math.min(model.value.length, result.selectionEnd);
  }

  applyReal(editor: RandomizedEditor): void {
    editor.insertTag(this.start, this.end, this.template);
  }

  toString(): string {
    return `${this.name}(${this.start}, ${this.end}, ${this.template.prefix})`;
  }
}

class FormatXmlCommand extends EditorCommand {
  readonly name = "format-xml" as const;

  check(): boolean {
    return true;
  }

  applyModel(model: EditorModel): void {
    setModelValue(model, formatXmlFragment(model.value));
  }

  applyReal(editor: RandomizedEditor): void {
    editor.formatXml();
  }

  toString(): string {
    return this.name;
  }
}

class ClearDocumentCommand extends EditorCommand {
  readonly name = "clear-document" as const;

  check(): boolean {
    return true;
  }

  applyModel(model: EditorModel): void {
    model.document = clearSsmlDocument(model.document);
    model.value = getEditableText(model.document);
    model.selectionStart = 0;
    model.selectionEnd = 0;
  }

  applyReal(editor: RandomizedEditor): void {
    editor.clearDocument();
  }

  toString(): string {
    return this.name;
  }
}

const offsetArbitrary = fc.integer({ min: 0, max: MAX_GENERATED_OFFSET });
const rangeArbitrary = fc
  .tuple(offsetArbitrary, offsetArbitrary)
  .map(([first, second]) => ({
    start: Math.min(first, second),
    end: Math.max(first, second),
  }));

const commandArbitrary = fc.oneof(
  fc.record({ position: offsetArbitrary, text: insertionTextArbitrary }).map(({ position, text }) => {
    return new InsertTextCommand(position, text);
  }),
  rangeArbitrary.map(({ start, end }) => new DeleteTextCommand(start, end)),
  rangeArbitrary.map(({ start, end }) => new SelectTextCommand(start, end)),
  fc
    .tuple(rangeArbitrary, fc.constantFrom(...TAG_TEMPLATES))
    .map(([{ start, end }, template]) => new InsertTagCommand(start, end, template)),
  fc.constant(new FormatXmlCommand()),
  fc.constant(new ClearDocumentCommand()),
);

let lastOperationLog: string[] = [];

test("preserves SSML invariants during model-based randomized editor operations", () => {
  try {
    fc.assert(
      fc.property(fc.commands([commandArbitrary], { maxCommands: OPERATION_COUNT }), (commands) => {
        const model = createModel();
        const editor = new RandomizedEditor();
        lastOperationLog = model.operationLog;
        for (const command of commands) {
          if (command.check(model)) {
            command.run(model, editor);
          }
        }
        checkInvariants(model, editor);
      }),
      {
        endOnFailure: true,
        numRuns: NUM_RUNS,
        seed: SEED,
      },
    );
  } catch (error) {
    console.error(
      `Random editor invariant failed with seed ${SEED}.\nExecuted operations:\n${lastOperationLog.join("\n") || "<none>"}`,
    );
    throw error;
  }
});
