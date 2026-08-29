import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  buildSsml,
  validateAzureSsml,
  type SsmlDocument,
  type SsmlElement,
  type SsmlNode,
  type SsmlDiagnostic,
  type AzureVoiceCatalogMetadata,
} from "@ssml-builder-js/ssml-core";
import { SSML_ELEMENT_COPY, type SsmlEditorLocale } from "../locales";

export interface VisualVoiceCatalogEntry {
  name: string;
  locale: string;
  region?: string;
  regions?: readonly string[];
  styles?: readonly string[];
  supportedTags?: readonly string[];
  unsupportedTags?: readonly string[];
  models?: readonly string[];
  preview?: boolean;
  status?: "ga" | "preview" | "deprecated";
}

export interface VoiceSelectorRenderProps {
  value: string;
  voices: readonly VisualVoiceCatalogEntry[];
  selectedVoice?: VisualVoiceCatalogEntry;
  readOnly: boolean;
  locale: SsmlEditorLocale;
  onChange: (voice: string) => void;
}

export interface VisualInspectorRenderProps {
  document: SsmlDocument;
  element: SsmlElement;
  path: number[];
  readOnly: boolean;
  onChange: (document: SsmlDocument) => void;
  locale: SsmlEditorLocale;
}

export type VisualInspectorRenderer = (props: VisualInspectorRenderProps) => ReactNode;

export interface VisualSsmlEditorProps {
  document: SsmlDocument;
  readOnly?: boolean;
  onChange?: (document: SsmlDocument) => void;
  onPreviewSelection?: (ssml: string) => void;
  locale?: SsmlEditorLocale;
  customInspectors?: Readonly<Record<string, VisualInspectorRenderer>>;
  renderVoiceSelector?: (props: VoiceSelectorRenderProps) => ReactNode;
  voiceCatalog?: readonly VisualVoiceCatalogEntry[];
  voiceLocale?: string;
  voiceRegion?: string;
  voiceStyle?: string;
  /** Selected Azure voice model used for live capability validation. */
  voiceModel?: string;
  /** Alias for voiceModel. */
  model?: string;
  voiceCatalogMetadata?: AzureVoiceCatalogMetadata;
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

function getNodeAtPath(nodes: SsmlNode[], path: number[]): SsmlNode | undefined {
  let current: SsmlNode | undefined;
  let currentNodes = nodes;
  for (const index of path) {
    current = currentNodes[index];
    if (current === undefined) return undefined;
    if (!isElement(current)) {
      currentNodes = [];
    } else {
      currentNodes = current.children ?? [];
    }
  }
  return current;
}

function updateElementAtPath(
  document: SsmlDocument,
  path: number[],
  update: (element: SsmlElement) => SsmlElement,
): SsmlDocument {
  return {
    ...document,
    children: updateNodesAtPath(document.children ?? [], path, (node) => (isElement(node) ? update(node) : node)),
  };
}

function updateElementText(element: SsmlElement, value: string): SsmlElement {
  return { ...element, children: [value] };
}

function updateOptionalElementProperty(
  document: SsmlDocument,
  path: number[],
  property: string,
  value: string,
): SsmlDocument {
  return updateElementAtPath(document, path, (element) => {
    const next = { ...element } as SsmlElement & Record<string, unknown>;
    if (value.trim()) next[property] = value;
    else delete next[property];
    return next;
  });
}

interface VisualElementField {
  key: string;
  label: string;
  multiline?: boolean;
}

const VISUAL_ELEMENT_FIELDS: Readonly<Record<string, readonly VisualElementField[]>> = {
  voice: [
    { key: "name", label: "Voice name" },
    { key: "effect", label: "Effect" },
  ],
  prosody: [
    { key: "rate", label: "Rate" },
    { key: "pitch", label: "Pitch" },
    { key: "volume", label: "Volume" },
    { key: "contour", label: "Contour" },
    { key: "range", label: "Range" },
  ],
  "express-as": [
    { key: "style", label: "Style" },
    { key: "styleDegree", label: "Style degree" },
    { key: "role", label: "Role" },
  ],
  expressAs: [
    { key: "style", label: "Style" },
    { key: "styleDegree", label: "Style degree" },
    { key: "role", label: "Role" },
  ],
  "mstts:express-as": [
    { key: "style", label: "Style" },
    { key: "styleDegree", label: "Style degree" },
    { key: "role", label: "Role" },
  ],
  "say-as": [
    { key: "interpretAs", label: "Interpret as" },
    { key: "format", label: "Format" },
    { key: "detail", label: "Detail" },
  ],
  sayAs: [
    { key: "interpretAs", label: "Interpret as" },
    { key: "format", label: "Format" },
    { key: "detail", label: "Detail" },
  ],
  phoneme: [
    { key: "alphabet", label: "Alphabet" },
    { key: "ph", label: "Pronunciation" },
  ],
  emphasis: [{ key: "level", label: "Level" }],
  audio: [
    { key: "src", label: "Source URL" },
    { key: "desc", label: "Description" },
    { key: "clipBegin", label: "Clip begin" },
    { key: "clipEnd", label: "Clip end" },
    { key: "speed", label: "Speed" },
    { key: "repeatCount", label: "Repeat count" },
    { key: "repeatDuration", label: "Repeat duration" },
    { key: "soundLevel", label: "Sound level" },
  ],
  mark: [{ key: "name", label: "Mark name" }],
  bookmark: [{ key: "mark", label: "Bookmark name" }],
  sub: [{ key: "alias", label: "Alias" }],
  lang: [{ key: "lang", label: "Language" }],
  lexicon: [{ key: "uri", label: "Lexicon URI" }],
  "mstts:silence": [
    { key: "typeValue", label: "Silence type" },
    { key: "value", label: "Value" },
  ],
  silence: [
    { key: "typeValue", label: "Silence type" },
    { key: "value", label: "Value" },
  ],
  "mstts:audioduration": [{ key: "value", label: "Duration" }],
  "mstts:ttsembedding": [{ key: "speakerProfileId", label: "Speaker profile ID" }],
  "mstts:embedding": [
    { key: "id", label: "Embedding ID" },
    { key: "speakerProfileId", label: "Speaker profile ID" },
  ],
  "mstts:voiceconversion": [
    { key: "url", label: "Source URL" },
    { key: "profile", label: "Profile" },
    { key: "speakerProfileId", label: "Speaker profile ID" },
  ],
};

function getElementFields(element: SsmlElement): readonly VisualElementField[] {
  return VISUAL_ELEMENT_FIELDS[elementLabel(element)] ?? [];
}

function localizedElementLabel(element: SsmlElement, locale: SsmlEditorLocale): string {
  return SSML_ELEMENT_COPY[locale][elementLabel(element)]?.label ?? elementLabel(element);
}

function filteredVoices(
  voiceCatalog: readonly VisualVoiceCatalogEntry[] | undefined,
  locale: string | undefined,
  region: string | undefined,
  style: string | undefined,
): readonly VisualVoiceCatalogEntry[] {
  return (voiceCatalog ?? []).filter((voice) => {
    if (locale && voice.locale.toLowerCase() !== locale.toLowerCase()) return false;
    const regions = [voice.region, ...(voice.regions ?? [])].filter((candidate): candidate is string =>
      Boolean(candidate),
    );
    if (region && regions.length > 0 && !regions.some((candidate) => candidate.toLowerCase() === region.toLowerCase()))
      return false;
    if (style && !voice.styles?.some((candidate) => candidate.toLowerCase() === style.toLowerCase())) return false;
    return true;
  });
}

function voiceForPath(
  document: SsmlDocument,
  path: number[] | undefined,
  voiceCatalog: readonly VisualVoiceCatalogEntry[] | undefined,
): VisualVoiceCatalogEntry | undefined {
  if (!path || !voiceCatalog) return undefined;
  const ancestors = getElementAncestors(document.children ?? [], path);
  const node = getNodeAtPath(document.children ?? [], path);
  const candidates = [...ancestors, ...(node && isElement(node) ? [node] : [])].reverse();
  const voiceName =
    candidates.find((element) => element.type === "voice")?.name ??
    candidates.find((element) => element.type === "mstts:turn")?.voice;
  return voiceName ? voiceCatalog.find((voice) => voice.name.toLowerCase() === voiceName.toLowerCase()) : undefined;
}

function isVisualTagSupported(tagName: string, voice: VisualVoiceCatalogEntry | undefined): boolean {
  if (!voice) return true;
  const tag = tagName.toLowerCase();
  const unsupported = new Set((voice.unsupportedTags ?? []).map((candidate) => candidate.toLowerCase()));
  const supported = voice.supportedTags?.map((candidate) => candidate.toLowerCase());
  return !unsupported.has(tag) && (supported === undefined || supported.includes(tag));
}

function VoiceCapabilityMatrix({
  voice,
  locale,
}: {
  voice: VisualVoiceCatalogEntry;
  locale: SsmlEditorLocale;
}): ReactElement {
  const status = voice.status ?? (voice.preview ? "preview" : undefined);
  return (
    <div className="ssml-editor-voice-capabilities" data-voice-capabilities="">
      <div>
        {locale === "ja" ? "ステータス" : "Status"}: {status?.toUpperCase() ?? (locale === "ja" ? "GA" : "GA")}
        {status === "preview" || status === "deprecated" ? (
          <span role="status" aria-label={status} className="ssml-editor-voice-warning-badge">
            {status === "preview" ? "⚠ Preview" : "⚠ Deprecated"}
          </span>
        ) : null}
      </div>
      {(voice.regions?.length || voice.region) && (
        <div>
          {locale === "ja" ? "リージョン" : "Regions"}:{" "}
          {[...(voice.regions ?? []), ...(voice.region ? [voice.region] : [])]
            .filter((region, index, all) => all.indexOf(region) === index)
            .join(", ")}
        </div>
      )}
      {voice.supportedTags && voice.supportedTags.length > 0 && (
        <div>
          {locale === "ja" ? "対応タグ" : "Supported tags"}: {voice.supportedTags.join(", ")}
        </div>
      )}
      {voice.unsupportedTags && voice.unsupportedTags.length > 0 && (
        <div className="ssml-editor-voice-unsupported">
          {locale === "ja" ? "非対応タグ" : "Unsupported tags"}: {voice.unsupportedTags.join(", ")}
        </div>
      )}
    </div>
  );
}

function diagnosticMatchesElement(diagnostic: SsmlDiagnostic, element: SsmlElement): boolean {
  const name = elementLabel(element).toLowerCase().replace("expressas", "mstts:express-as");
  if (diagnostic.code === "azure-unsupported-style") return name === "mstts:express-as" || name === "express-as";
  if (diagnostic.code === "azure-unsupported-tag-for-voice") {
    return (
      diagnostic.message.toLowerCase().includes(`<${name}>`) ||
      diagnostic.message.toLowerCase().includes(`<${name.replace("mstts:", "")}>`)
    );
  }
  if (diagnostic.code === "azure-locale-mismatch" || diagnostic.code === "azure-unsupported-model-for-voice")
    return name === "voice" || name === "mstts:turn";
  return false;
}

function elementWarnings(diagnostics: readonly SsmlDiagnostic[], element: SsmlElement): readonly SsmlDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnosticMatchesElement(diagnostic, element));
}

function fieldWarnings(
  diagnostics: readonly SsmlDiagnostic[],
  element: SsmlElement,
  field: VisualElementField,
): readonly SsmlDiagnostic[] {
  return elementWarnings(diagnostics, element).filter((diagnostic) => {
    if (diagnostic.code === "azure-unsupported-style") return field.key === "style";
    return field.key === "name" || field.key === "voice";
  });
}

function WarningBadge({ messages }: { messages: readonly SsmlDiagnostic[] }): ReactElement | null {
  if (messages.length === 0) return null;
  return (
    <span
      role="status"
      aria-label={messages.map((message) => message.message).join(" ")}
      title={messages.map((message) => message.message).join(" ")}
      data-ssml-warning-badge=""
      data-testid="ssml-editor-warning-badge"
      className="ssml-editor-warning-badge"
    >
      ⚠
    </span>
  );
}

function DefaultVoiceSelector({
  value,
  voices,
  selectedVoice,
  readOnly,
  locale,
  onChange,
}: VoiceSelectorRenderProps): ReactElement {
  return (
    <>
      <select
        aria-label={locale === "ja" ? "音声" : "Voice"}
        value={value}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{locale === "ja" ? "音声を選択" : "Select a voice"}</option>
        {voices.map((voice) => (
          <option key={voice.name} value={voice.name}>
            {voice.name}
            {voice.preview || voice.status === "preview" ? " (preview)" : ""}
          </option>
        ))}
      </select>
      {selectedVoice ? <VoiceCapabilityMatrix voice={selectedVoice} locale={locale} /> : null}
    </>
  );
}

function VisualElementInspector({
  document,
  element,
  path,
  readOnly,
  commit,
  locale,
  customInspector,
  renderVoiceSelector,
  voiceCatalog,
  voiceLocale,
  voiceRegion,
  voiceStyle,
  diagnostics,
  voiceDefinition,
}: {
  document: SsmlDocument;
  element: SsmlElement;
  path: number[];
  readOnly: boolean;
  commit: (document: SsmlDocument) => void;
  locale: SsmlEditorLocale;
  customInspector?: VisualInspectorRenderer;
  renderVoiceSelector?: (props: VoiceSelectorRenderProps) => ReactNode;
  voiceCatalog?: readonly VisualVoiceCatalogEntry[];
  voiceLocale?: string;
  voiceRegion?: string;
  voiceStyle?: string;
  diagnostics: readonly SsmlDiagnostic[];
  voiceDefinition?: VisualVoiceCatalogEntry;
}): ReactElement {
  const tagSupported = isVisualTagSupported(elementLabel(element), voiceDefinition);
  if (customInspector) {
    return (
      <>{customInspector({ document, element, path, readOnly: readOnly || !tagSupported, onChange: commit, locale })}</>
    );
  }
  const fields = getElementFields(element);
  const availableVoices = filteredVoices(voiceCatalog, voiceLocale, voiceRegion, voiceStyle);
  const selectedVoice = voiceCatalog?.find(
    (voice) => voice.name === (element.type === "voice" ? element.name : undefined),
  );
  const renderSelector = renderVoiceSelector ?? DefaultVoiceSelector;
  return (
    <fieldset disabled={readOnly || !tagSupported} style={!tagSupported ? { border: "1px solid #c0392b" } : undefined}>
      <legend>
        {`<${elementLabel(element)}>`} <WarningBadge messages={elementWarnings(diagnostics, element)} />
      </legend>
      {fields.length === 0 ? (
        <p>This element is preserved in the visual tree. Edit its attributes in Code mode.</p>
      ) : (
        fields.map((field) => {
          const value = (element as SsmlElement & Record<string, unknown>)[field.key];
          const inputValue = value === undefined ? "" : String(value);
          const inputId = `ssml-visual-${field.key}`;
          return (
            <label key={field.key} htmlFor={inputId}>
              {locale === "ja"
                ? ((
                    {
                      name: "名前",
                      effect: "効果",
                      rate: "速度",
                      pitch: "ピッチ",
                      volume: "音量",
                      contour: "ピッチ曲線",
                      range: "範囲",
                      style: "スタイル",
                      styleDegree: "スタイル強度",
                      role: "役割",
                      interpretAs: "解釈",
                      alphabet: "アルファベット",
                      ph: "発音",
                      level: "強調レベル",
                      src: "音声 URL",
                      desc: "説明",
                      clipBegin: "開始位置",
                      clipEnd: "終了位置",
                      speed: "速度",
                      repeatCount: "繰り返し回数",
                      repeatDuration: "繰り返し時間",
                      soundLevel: "音量レベル",
                      mark: "ブックマーク名",
                      alias: "別名",
                      lang: "言語",
                      uri: "辞書 URI",
                      typeValue: "無音の種類",
                      value: "値",
                      id: "埋め込み ID",
                      speakerProfileId: "話者プロファイル ID",
                      url: "音声変換 URL",
                      profile: "プロファイル",
                    } as Record<string, string>
                  )[field.key] ?? field.label)
                : field.label}
              <WarningBadge messages={fieldWarnings(diagnostics, element, field)} />
              {field.key === "name" && elementLabel(element) === "voice" && voiceCatalog ? (
                renderSelector({
                  value: inputValue,
                  voices: availableVoices,
                  selectedVoice,
                  readOnly,
                  locale,
                  onChange: (value) => commit(updateOptionalElementProperty(document, path, field.key, value)),
                })
              ) : field.multiline ? (
                <textarea
                  id={inputId}
                  value={inputValue}
                  disabled={readOnly || !tagSupported}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, path, field.key, event.target.value))
                  }
                />
              ) : (
                <input
                  id={inputId}
                  value={inputValue}
                  disabled={readOnly || !tagSupported}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, path, field.key, event.target.value))
                  }
                />
              )}
            </label>
          );
        })
      )}
    </fieldset>
  );
}

function getElementAncestors(nodes: SsmlNode[], path: number[], ancestors: SsmlElement[] = []): SsmlElement[] {
  const [index, ...rest] = path;
  const node = nodes[index];
  if (!node || !isElement(node)) return ancestors;
  if (rest.length === 0) return ancestors;
  return getElementAncestors(node.children ?? [], rest, [...ancestors, node]);
}

function buildVisualPreview(document: SsmlDocument, leaf: TextLeaf, selection: { start: number; end: number }): string {
  const start = Math.max(0, Math.min(selection.start, leaf.value.length));
  const end = Math.max(start, Math.min(selection.end, leaf.value.length));
  const value = start === end ? leaf.value : leaf.value.slice(start, end);
  const ancestors = getElementAncestors(document.children ?? [], leaf.path);
  const children = ancestors.reduceRight<SsmlNode[]>(
    (current, ancestor) => [{ ...ancestor, children: current }],
    [value],
  );
  return buildSsml({ ...document, children });
}

function addDialogTurn(document: SsmlDocument, path: number[]): SsmlDocument {
  return updateElementAtPath(document, path, (element) => ({
    ...element,
    children: [
      ...(element.children ?? []),
      { type: "mstts:turn", voice: "en-US-JennyNeural", children: ["New dialog turn"] },
    ],
  }));
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
  getWarnings,
}: {
  node: SsmlNode;
  path: number[];
  selectedPath: number[] | null;
  onSelect: (path: number[]) => void;
  getWarnings: (element: SsmlElement) => readonly SsmlDiagnostic[];
}): ReactElement | null {
  if (!isElement(node)) return null;
  const name = elementLabel(node);
  const messages = getWarnings(node);
  const isSelected = selectedPath?.join(".") === path.join(".");
  return (
    <li
      data-ssml-diagnostic={messages.length > 0 ? "error" : undefined}
      style={messages.length > 0 ? { border: "1px solid #c0392b", borderRadius: "0.25rem" } : undefined}
    >
      <button type="button" aria-current={isSelected ? "true" : undefined} onClick={() => onSelect(path)}>
        {`<${name}>`}
        <WarningBadge messages={getWarnings(node)} />
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
              getWarnings={getWarnings}
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
  locale = "en",
  customInspectors,
  renderVoiceSelector,
  voiceCatalog,
  voiceLocale,
  voiceRegion,
  voiceStyle,
  voiceModel,
  model,
  voiceCatalogMetadata,
}: VisualSsmlEditorProps): ReactElement {
  const [selectedPath, setSelectedPath] = useState<number[] | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const textLeaves = useMemo(() => collectTextLeaves(document.children ?? []), [document]);
  const selectedLeaf = textLeaves.find((leaf) => leaf.path.join(".") === selectedPath?.join(".")) ?? textLeaves[0];
  const selectedElement = selectedPath ? getNodeAtPath(document.children ?? [], selectedPath) : undefined;
  const activeVoice = voiceForPath(document, selectedPath ?? selectedLeaf?.path, voiceCatalog);
  const staleCatalog = voiceCatalogMetadata?.expiresAt
    ? Date.parse(voiceCatalogMetadata.expiresAt) <= Date.now()
    : false;
  const selectedCustomInspector =
    selectedElement && isElement(selectedElement)
      ? (customInspectors?.[elementLabel(selectedElement)] ?? customInspectors?.[selectedElement.type])
      : undefined;
  const validationOptions = useMemo(
    () => ({
      model: voiceModel ?? model,
      customVoiceDefinitions: voiceCatalog?.map((voice) => ({
        name: voice.name,
        locale: voice.locale,
        regions: voice.regions ?? (voice.region ? [voice.region] : undefined),
        styles: voice.styles,
        supportedTags: voice.supportedTags,
        unsupportedTags: voice.unsupportedTags,
        models: voice.models,
        status: voice.status ?? (voice.preview ? "preview" : "ga"),
      })),
    }),
    [model, voiceCatalog, voiceModel],
  );
  const diagnostics = useMemo(
    () => validateAzureSsml(buildSsml(document), validationOptions) as SsmlDiagnostic[],
    [document, validationOptions],
  );
  const getWarnings = (element: SsmlElement): readonly SsmlDiagnostic[] => elementWarnings(diagnostics, element);
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
      {staleCatalog && (
        <div role="status" className="ssml-editor-visual-catalog-warning">
          {locale === "ja"
            ? "音声カタログが古くなっています。更新してください。"
            : "The voice catalog is stale. Refresh it before synthesizing."}
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
                getWarnings={getWarnings}
              />
            ))}
          </ul>
        </nav>
        <div className="ssml-editor-visual-form">
          {selectedCustomInspector && selectedElement && isElement(selectedElement) ? (
            selectedCustomInspector({
              document,
              element: selectedElement,
              path: selectedPath ?? [],
              readOnly: readOnly || !isVisualTagSupported(elementLabel(selectedElement), activeVoice),
              onChange: commit,
              locale,
            })
          ) : selectedElement && isElement(selectedElement) && selectedElement.type === "mstts:dialog" ? (
            <fieldset>
              <legend>{localizedElementLabel(selectedElement, locale)}</legend>
              <p>{SSML_ELEMENT_COPY[locale][elementLabel(selectedElement)]?.description}</p>
              <button
                type="button"
                disabled={readOnly || !isVisualTagSupported("mstts:dialog", activeVoice)}
                onClick={() => commit(addDialogTurn(document, selectedPath ?? []))}
              >
                {locale === "ja" ? "ターンを追加" : "Add turn"}
              </button>
            </fieldset>
          ) : selectedElement && isElement(selectedElement) && selectedElement.type === "mstts:turn" ? (
            <fieldset>
              <legend>{localizedElementLabel(selectedElement, locale)}</legend>
              <label htmlFor="ssml-visual-turn-voice">
                {locale === "ja" ? "音声" : "Voice"}
                <WarningBadge messages={elementWarnings(diagnostics, selectedElement)} />
                {voiceCatalog ? (
                  (renderVoiceSelector ?? DefaultVoiceSelector)({
                    value: selectedElement.voice ?? "",
                    voices: filteredVoices(voiceCatalog, voiceLocale, voiceRegion, voiceStyle),
                    selectedVoice: voiceCatalog?.find((voice) => voice.name === selectedElement.voice),
                    readOnly,
                    locale,
                    onChange: (value) =>
                      commit(updateOptionalElementProperty(document, selectedPath ?? [], "voice", value)),
                  })
                ) : (
                  <input
                    id="ssml-visual-turn-voice"
                    value={selectedElement.voice ?? ""}
                    readOnly={readOnly}
                    onChange={(event) =>
                      commit(updateOptionalElementProperty(document, selectedPath ?? [], "voice", event.target.value))
                    }
                  />
                )}
              </label>
              <label>
                {locale === "ja" ? "話者" : "Speaker"}
                <input
                  value={selectedElement.speaker ?? ""}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, selectedPath ?? [], "speaker", event.target.value))
                  }
                />
              </label>
              <label>
                {locale === "ja" ? "発話テキスト" : "Turn text"}
                <textarea
                  value={
                    selectedElement.children?.filter((child): child is string => typeof child === "string").join("") ??
                    ""
                  }
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(
                      updateElementAtPath(document, selectedPath ?? [], (element) =>
                        updateElementText(element, event.target.value),
                      ),
                    )
                  }
                />
              </label>
            </fieldset>
          ) : selectedElement && isElement(selectedElement) && selectedElement.type === "mstts:backgroundaudio" ? (
            <fieldset>
              <legend>{localizedElementLabel(selectedElement, locale)}</legend>
              <label>
                {locale === "ja" ? "音声 URL" : "Source URL"}
                <input
                  value={selectedElement.src ?? ""}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, selectedPath ?? [], "src", event.target.value))
                  }
                />
              </label>
              <label>
                {locale === "ja" ? "音量" : "Volume"}
                <input
                  value={selectedElement.volume === undefined ? "" : String(selectedElement.volume)}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, selectedPath ?? [], "volume", event.target.value))
                  }
                />
              </label>
              <label>
                {locale === "ja" ? "フェードイン" : "Fade in"}
                <input
                  value={selectedElement.fadeIn === undefined ? "" : String(selectedElement.fadeIn)}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, selectedPath ?? [], "fadeIn", event.target.value))
                  }
                />
              </label>
              <label>
                {locale === "ja" ? "フェードアウト" : "Fade out"}
                <input
                  value={selectedElement.fadeOut === undefined ? "" : String(selectedElement.fadeOut)}
                  readOnly={readOnly}
                  onChange={(event) =>
                    commit(updateOptionalElementProperty(document, selectedPath ?? [], "fadeOut", event.target.value))
                  }
                />
              </label>
            </fieldset>
          ) : selectedElement && isElement(selectedElement) ? (
            <VisualElementInspector
              document={document}
              element={selectedElement}
              path={selectedPath ?? []}
              readOnly={readOnly}
              commit={commit}
              locale={locale}
              customInspector={
                customInspectors?.[elementLabel(selectedElement)] ?? customInspectors?.[selectedElement.type]
              }
              renderVoiceSelector={renderVoiceSelector}
              voiceCatalog={voiceCatalog}
              voiceLocale={voiceLocale}
              voiceRegion={voiceRegion}
              voiceStyle={voiceStyle}
              diagnostics={diagnostics}
              voiceDefinition={activeVoice}
            />
          ) : selectedLeaf ? (
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
                <button
                  type="button"
                  disabled={readOnly || !isVisualTagSupported("prosody", activeVoice)}
                  onClick={() => applyWrapper("prosody", { rate: "slow" })}
                >
                  Rate
                </button>
                <button
                  type="button"
                  disabled={readOnly || !isVisualTagSupported("prosody", activeVoice)}
                  onClick={() => applyWrapper("prosody", { pitch: "high" })}
                >
                  Pitch
                </button>
                <button
                  type="button"
                  disabled={readOnly || !isVisualTagSupported("mstts:express-as", activeVoice)}
                  onClick={() => applyWrapper("mstts:express-as", { style: "cheerful" })}
                >
                  Emotion
                </button>
                <button
                  type="button"
                  disabled={readOnly || !isVisualTagSupported("break", activeVoice)}
                  onClick={() => applyWrapper("break", { time: "500ms" })}
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={readOnly || !isVisualTagSupported("phoneme", activeVoice)}
                  onClick={() => applyWrapper("phoneme", { alphabet: "ipa", ph: selectedLeaf.value })}
                >
                  Pronunciation
                </button>
                {onPreviewSelection && (
                  <button
                    type="button"
                    onClick={() => onPreviewSelection(buildVisualPreview(document, selectedLeaf, selection))}
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
