import {
  areAzureLanguagesEquivalent,
  buildSsml,
  fromPlainTextToSsml,
  parseSsml,
  validateAzureSsml,
  validateSsml,
} from "@ssml-builder-js/ssml-core";
import type {
  ProsodyElement,
  SsmlDiagnostic,
  SsmlDocument,
  SsmlElement,
  SsmlNode,
  SsmlValidationError,
  VoiceElement,
} from "@ssml-builder-js/ssml-core";

export type SpeechLanguage = "ja-JP" | "en-US" | "ko" | "zh-Hans" | "fr" | "pt-BR" | "it" | "de" | "ru";
export type TemplateId = "announcement" | "narration" | "learning";
export type ImportMode = "text" | "ssml";
export type PreviewScope = "document" | "selection";
export type ProsodySetting = "rate" | "pitch" | "volume";

export interface StudioDraft {
  title: string;
  ssml: string;
}

export interface StudioProject extends StudioDraft {
  document: SsmlDocument | null;
}

export interface DraftSnapshot extends StudioDraft {
  version: 1;
  updatedAt: number;
}

export const DRAFT_STORAGE_KEY = "ssml-builder-studio-draft-v1";
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_TITLE_LENGTH = 120;

export const SPEECH_LANGUAGES = [
  { value: "ja-JP", label: "日本語", female: "Nanami", male: "Keita", prefix: "ja-JP" },
  { value: "en-US", label: "English", female: "Jenny", male: "Guy", prefix: "en-US" },
  { value: "ko", label: "한국어", female: "SunHi", male: "InJoon", prefix: "ko-KR" },
  { value: "zh-Hans", label: "简体中文", female: "Xiaoxiao", male: "Yunxi", prefix: "zh-CN" },
  { value: "fr", label: "Français", female: "Denise", male: "Henri", prefix: "fr-FR" },
  { value: "pt-BR", label: "Português", female: "Francisca", male: "Antonio", prefix: "pt-BR" },
  { value: "it", label: "Italiano", female: "Elsa", male: "Diego", prefix: "it-IT" },
  { value: "de", label: "Deutsch", female: "Katja", male: "Conrad", prefix: "de-DE" },
  { value: "ru", label: "Русский", female: "Svetlana", male: "Dmitry", prefix: "ru-RU" },
] as const satisfies readonly {
  value: SpeechLanguage;
  label: string;
  female: string;
  male: string;
  prefix: string;
}[];

export const VOICE_OPTIONS = SPEECH_LANGUAGES.flatMap((language) => [
  {
    name: `${language.prefix}-${language.female}Neural`,
    displayName: language.female,
    language: language.value,
    gender: "female" as const,
  },
  {
    name: `${language.prefix}-${language.male}Neural`,
    displayName: language.male,
    language: language.value,
    gender: "male" as const,
  },
]);

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function isElement(node: SsmlNode): node is SsmlElement {
  return typeof node !== "string" && node.type !== "text";
}

function findElement<T extends SsmlElement>(
  nodes: readonly SsmlNode[],
  predicate: (node: SsmlElement) => node is T,
): T | undefined {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (predicate(node)) return node;
    const found = findElement(node.children ?? [], predicate);
    if (found) return found;
  }
  return undefined;
}

function isVoice(node: SsmlElement): node is VoiceElement {
  return node.type === "voice";
}

function isProsody(node: SsmlElement): node is ProsodyElement {
  return node.type === "prosody";
}

export function getPrimaryVoice(document: SsmlDocument): VoiceElement | undefined {
  return findElement(getDocumentChildren(document), isVoice);
}

export function getPrimaryProsody(document: SsmlDocument): ProsodyElement | undefined {
  const voice = getPrimaryVoice(document);
  return findElement(voice ? (voice.children ?? []) : getDocumentChildren(document), isProsody);
}

export function getSpeechLanguage(language: string): SpeechLanguage | undefined {
  return SPEECH_LANGUAGES.find((option) => areAzureLanguagesEquivalent(option.value, language))?.value;
}

export function getDefaultVoice(language: SpeechLanguage, gender: "female" | "male" = "female"): string {
  const voice = VOICE_OPTIONS.find((option) => option.language === language && option.gender === gender);
  if (!voice) throw new Error(`No starter voice is available for ${language}.`);
  return voice.name;
}

function updateFirstElement<T extends SsmlElement>(
  nodes: SsmlNode[],
  predicate: (node: SsmlElement) => node is T,
  update: (node: T) => T,
): { nodes: SsmlNode[]; updated: boolean } {
  let updated = false;
  const nextNodes = nodes.map((node) => {
    if (updated || !isElement(node)) return node;
    if (predicate(node)) {
      updated = true;
      return update(node);
    }
    if (!node.children) return node;
    const result = updateFirstElement(node.children, predicate, update);
    if (!result.updated) return node;
    updated = true;
    return { ...node, children: result.nodes };
  });
  return { nodes: nextNodes, updated };
}

function withChildren(document: SsmlDocument, children: SsmlNode[]): SsmlDocument {
  const next = { ...document, children };
  delete next.content;
  return next;
}

export function updateVoice(document: SsmlDocument, voiceName: string, language = document.lang): SsmlDocument {
  if (!voiceName.trim()) throw new Error("A voice name is required.");
  const children = getDocumentChildren(document);
  const result = updateFirstElement(children, isVoice, (voice) => ({ ...voice, name: voiceName }));
  const nextChildren: SsmlNode[] = result.updated ? result.nodes : [{ type: "voice", name: voiceName, children }];
  return { ...withChildren(document, nextChildren), lang: language };
}

export function updateProsody(document: SsmlDocument, setting: ProsodySetting, value: string): SsmlDocument {
  const updateChildren = (children: SsmlNode[]): SsmlNode[] => {
    const result = updateFirstElement(children, isProsody, (prosody) => ({ ...prosody, [setting]: value }));
    if (result.updated) return result.nodes;
    return [{ type: "prosody", [setting]: value, children }];
  };
  const children = getDocumentChildren(document);
  const result = updateFirstElement(children, isVoice, (voice) => ({
    ...voice,
    children: updateChildren(voice.children ?? []),
  }));
  return withChildren(document, result.updated ? result.nodes : updateChildren(children));
}

export function createTextDocument(text: string, language: SpeechLanguage, voiceName = getDefaultVoice(language)) {
  return parseSsml(fromPlainTextToSsml(text, { lang: language, voice: voiceName }));
}

export function rewriteTextDocument(document: SsmlDocument, text: string): SsmlDocument {
  const voice = getPrimaryVoice(document);
  const language = getSpeechLanguage(document.lang) ?? "en-US";
  let next = createTextDocument(text, language, voice?.name ?? getDefaultVoice(language));
  next = { ...next, version: document.version, lang: document.lang, attributes: document.attributes };
  const prosody = getPrimaryProsody(document);
  for (const setting of ["rate", "pitch", "volume"] as const) {
    const value = prosody?.[setting];
    if (value !== undefined) next = updateProsody(next, setting, String(value));
  }
  if (voice) {
    next = withChildren(
      next,
      updateFirstElement(getDocumentChildren(next), isVoice, (generated) => ({
        ...voice,
        children: generated.children,
      })).nodes,
    );
  }
  return next;
}

export function createTemplateDocument(text: string, language: SpeechLanguage, template: TemplateId): SsmlDocument {
  const document = createTextDocument(text, language);
  const rate = template === "learning" ? "slow" : "medium";
  const tuned = updateProsody(document, "rate", rate);
  return withChildren(
    tuned,
    updateFirstElement(getDocumentChildren(tuned), isProsody, (prosody) => {
      const children: SsmlNode[] = [];
      for (const [index, node] of (prosody.children ?? []).entries()) {
        if (index > 0) children.push("\n", { type: "break", time: template === "learning" ? "800ms" : "500ms" }, "\n");
        children.push(node);
      }
      return { ...prosody, children };
    }).nodes,
  );
}

export function projectFromDraft(draft: StudioDraft): StudioProject {
  const syntaxError = validateSsml(draft.ssml);
  return { ...draft, document: syntaxError ? null : parseSsml(draft.ssml) };
}

export function readDraftSnapshot(raw: string): DraftSnapshot {
  const value: unknown = JSON.parse(raw);
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("title" in value) ||
    typeof value.title !== "string" ||
    value.title.length > MAX_TITLE_LENGTH ||
    !("ssml" in value) ||
    typeof value.ssml !== "string" ||
    !("updatedAt" in value) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new Error("The saved draft has an unsupported format. It has not been overwritten.");
  }
  return { version: 1, title: value.title, ssml: value.ssml, updatedAt: value.updatedAt };
}

export function assertImportSize(source: string): void {
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
    throw new Error("The script exceeds the 1 MB limit.");
  }
}

export function importDraft(
  source: string,
  mode: ImportMode,
  title: string,
  language: SpeechLanguage,
  voiceName = getDefaultVoice(language),
): StudioDraft {
  assertImportSize(source);
  if (!source.trim()) throw new Error("The script is empty.");
  if (mode === "text") {
    return {
      title: title.slice(0, MAX_TITLE_LENGTH),
      ssml: buildSsml(createTextDocument(source, language, voiceName)),
    };
  }
  const syntaxError = getSyntaxError(source);
  if (syntaxError) throw new Error(`${syntaxError.message} (${syntaxError.line}:${syntaxError.column})`);
  return { title: title.slice(0, MAX_TITLE_LENGTH), ssml: source };
}

function getReadableText(node: SsmlNode): string {
  if (typeof node === "string") return node;
  if (node.type === "text") return node.value;
  const text = (node.children ?? []).map(getReadableText).join("");
  if (node.type === "p" || node.type === "voice" || node.type === "mstts:turn") return `${text.trim()}\n\n`;
  if (node.type === "s") return `${text.trim()} `;
  return text;
}

function getPauseSeconds(nodes: readonly SsmlNode[]): number {
  let seconds = 0;
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (node.type === "break" && node.time !== undefined) {
      const match = String(node.time).match(/^(\d+(?:\.\d+)?)(ms|s)$/);
      if (match) seconds += Number(match[1]) / (match[2] === "ms" ? 1000 : 1);
    }
    seconds += getPauseSeconds(node.children ?? []);
  }
  return seconds;
}

export function getRateMultiplier(rate: string | number | undefined): number {
  if (rate === "x-slow") return 0.6;
  if (rate === "slow") return 0.8;
  if (rate === "fast") return 1.2;
  if (rate === "x-fast") return 1.5;
  const percentage = String(rate ?? "").match(/^([+-]?\d+(?:\.\d+)?)%$/);
  if (percentage) return Math.max(0.1, 1 + Number(percentage[1]) / 100);
  const multiplier = Number(rate);
  if (Number.isFinite(multiplier) && multiplier > 0) return multiplier;
  return 1;
}

export interface StudioInspection {
  text: string;
  characters: number;
  paragraphs: number;
  estimatedSeconds: number;
  syntaxError: (SsmlValidationError & { line: number; column: number }) | null;
  diagnostics: SsmlDiagnostic[];
  canSynthesize: boolean;
}

function getSyntaxError(source: string): StudioInspection["syntaxError"] {
  const error = validateSsml(source);
  if (!error) return null;
  const lines = source.slice(0, error.position).split(/\r\n|\r|\n/);
  return { ...error, line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

export function inspectProject(project: Pick<StudioProject, "ssml" | "document">): StudioInspection {
  const syntaxError = getSyntaxError(project.ssml);
  const diagnostics = syntaxError ? [] : validateAzureSsml(project.ssml);
  const text = project.document
    ? getDocumentChildren(project.document)
        .map(getReadableText)
        .join("")
        .replace(/\n\s*\n/g, "\n\n")
        .trim()
    : "";
  const characters = [...text.replace(/\s/g, "")].length;
  const paragraphs = text ? text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length : 0;
  let estimatedSeconds = 0;
  if (project.document && characters > 0) {
    const language = getSpeechLanguage(project.document.lang);
    const isCjk = language === "ja-JP" || language === "ko" || language === "zh-Hans";
    const speakingSeconds = isCjk ? characters / 6 : text.split(/\s+/).length / 2.5;
    const rate = getRateMultiplier(getPrimaryProsody(project.document)?.rate);
    estimatedSeconds = Math.max(
      1,
      Math.ceil(speakingSeconds / rate + getPauseSeconds(getDocumentChildren(project.document))),
    );
  }
  const hasAudio = project.document
    ? findElement(
        getDocumentChildren(project.document),
        (node): node is Extract<SsmlElement, { type: "audio" }> => node.type === "audio",
      ) !== undefined
    : false;
  return {
    text,
    characters,
    paragraphs,
    estimatedSeconds,
    syntaxError,
    diagnostics,
    canSynthesize:
      !syntaxError && (characters > 0 || hasAudio) && !diagnostics.some((item) => item.severity === "error"),
  };
}

export function createCaptionTrack(ssml: string): string {
  const project = projectFromDraft({ title: "", ssml });
  const inspection = inspectProject(project);
  if (inspection.syntaxError) throw new Error(inspection.syntaxError.message);
  const text = inspection.text.replace(/\s+/g, " ").replaceAll("-->", "-- >");
  const vtt = `WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n${text}`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`;
}

export function downloadName(title: string, extension: "ssml" | "mp3"): string {
  const base = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, MAX_TITLE_LENGTH);
  return `${base || "speech"}.${extension}`;
}
