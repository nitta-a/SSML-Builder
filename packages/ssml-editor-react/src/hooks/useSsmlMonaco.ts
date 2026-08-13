import { useCallback, useEffect, useRef } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import { INLINE_BADGE_COPY, type SsmlEditorLanguage, type SsmlEditorLocale } from "../locales";
import {
  clearSsmlDiagnostics,
  type MonacoEditor,
  type MonacoModel,
  type SsmlSyntaxError,
  updateSsmlDiagnostics,
} from "../ssmlDiagnostics";
import { registerSsmlCompletionProvider } from "../ssmlCompletion";
import { registerSsmlCodeActions } from "../ssmlCodeAction";
import { findSsmlHoverTarget, formatSsmlHover } from "../ssmlHover";
import type { MonacoEditorRef } from "./useSsmlEditorState";

type MonacoLanguages = Monaco["languages"];
type MonacoDisposable = ReturnType<MonacoEditor["onDidChangeCursorSelection"]>;
type MonacoContentDisposable = ReturnType<MonacoEditor["onDidChangeModelContent"]>;
type MonacoCompletionDisposable = ReturnType<MonacoLanguages["registerCompletionItemProvider"]>;
type MonacoCodeActionDisposable = ReturnType<MonacoLanguages["registerCodeActionProvider"]>;
type MonacoHoverProvider = Parameters<MonacoLanguages["registerHoverProvider"]>[1];
type MonacoHoverModel = Parameters<MonacoHoverProvider["provideHover"]>[0];
type MonacoHoverPosition = Parameters<MonacoHoverProvider["provideHover"]>[1];
type MonacoDecoration = Parameters<MonacoModel["deltaDecorations"]>[1][number];

const SSML_DIAGNOSTICS_DEBOUNCE_MS = 300;

interface HoverProviderRegistration {
  disposable: ReturnType<MonacoLanguages["registerHoverProvider"]>;
  references: number;
}

const hoverProviderRegistrations = new WeakMap<MonacoLanguages, Map<SsmlEditorLocale, HoverProviderRegistration>>();

export interface UseSsmlMonacoOptions {
  editorRef?: MonacoEditorRef;
  language: SsmlEditorLanguage;
  text: string;
  decorationsVisible: boolean;
  onSelectionOverlayChange: (editor: MonacoEditor, notify: boolean) => void;
  onSyntaxErrorChange: (error: SsmlSyntaxError | null) => void;
}

export interface UseSsmlMonacoResult {
  editorRef: { current: MonacoEditor | null };
  onMount: OnMount;
}

function acquireSsmlHoverProvider(monaco: Monaco, locale: SsmlEditorLocale): () => void {
  const languages = monaco.languages;
  let registrations = hoverProviderRegistrations.get(languages);
  if (!registrations) {
    registrations = new Map();
    hoverProviderRegistrations.set(languages, registrations);
  }
  let registration = registrations.get(locale);

  if (!registration) {
    const provider: MonacoHoverProvider = {
      provideHover(model: MonacoHoverModel, position: MonacoHoverPosition) {
        const target = findSsmlHoverTarget(model.getValue(), position.lineNumber, position.column);
        if (!target) {
          return undefined;
        }

        return {
          contents: [
            {
              isTrusted: false,
              supportHtml: false,
              value: formatSsmlHover(target, locale),
            },
          ],
          range: target.range,
        };
      },
    };
    const disposable = languages.registerHoverProvider("xml", provider);
    registration = { disposable, references: 0 };
    registrations.set(locale, registration);
  }

  registration.references += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;

    const currentRegistrations = hoverProviderRegistrations.get(languages);
    const current = currentRegistrations?.get(locale);
    if (!current) {
      return;
    }

    current.references -= 1;
    if (current.references === 0) {
      current.disposable.dispose();
      currentRegistrations?.delete(locale);
      if (currentRegistrations?.size === 0) {
        hoverProviderRegistrations.delete(languages);
      }
    }
  };
}

function getSsmlAttributeValue(tag: string, attributeName: string): string | undefined {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedAttributeName}\\s*=\\s*("|')([^"']*)\\1`, "i"));
  return match?.[2];
}

function getSsmlInlineDecorations(model: MonacoModel, value: string, language: SsmlEditorLanguage): MonacoDecoration[] {
  const decorations: MonacoDecoration[] = [];
  const tagPattern = /<(break|prosody)\b[^>]*>/gi;
  const badgeCopy = INLINE_BADGE_COPY[language];

  for (const match of value.matchAll(tagPattern)) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const startOffset = match.index ?? 0;
    const endOffset = startOffset + tag.length;
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(endOffset);
    const pauseValue = getSsmlAttributeValue(tag, "time") ?? getSsmlAttributeValue(tag, "strength");
    const pitchValue =
      getSsmlAttributeValue(tag, "pitch") ??
      getSsmlAttributeValue(tag, "contour") ??
      getSsmlAttributeValue(tag, "range");
    const prosodyValue = pitchValue ?? getSsmlAttributeValue(tag, "rate") ?? getSsmlAttributeValue(tag, "volume");

    const badge =
      tagName === "break"
        ? `${badgeCopy.pause}${pauseValue ? ` ${pauseValue}` : ""}`
        : `${pitchValue ? badgeCopy.pitch : badgeCopy.prosody}${prosodyValue ? ` ${prosodyValue}` : ""}`;

    decorations.push({
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      options: {
        after: {
          content: ` ${badge}`,
          inlineClassName: `ssml-editor-inline-badge ssml-editor-inline-badge-${tagName === "break" ? "pause" : "prosody"}`,
        },
      },
    });
  }

  return decorations;
}

function syncSsmlInlineDecorations(
  model: MonacoModel,
  value: string,
  language: SsmlEditorLanguage,
  showDecorations: boolean,
  decorationIds: string[],
): string[] {
  return model.deltaDecorations(decorationIds, showDecorations ? getSsmlInlineDecorations(model, value, language) : []);
}

export function useSsmlMonaco({
  editorRef: externalEditorRef,
  language,
  text,
  decorationsVisible,
  onSelectionOverlayChange,
  onSyntaxErrorChange,
}: UseSsmlMonacoOptions): UseSsmlMonacoResult {
  const internalEditorRef = useRef<MonacoEditor | null>(null);
  const editorRef = useRef(externalEditorRef ?? internalEditorRef).current;
  const monacoRef = useRef<Monaco | null>(null);
  const completionProviderRef = useRef<MonacoCompletionDisposable | null>(null);
  const codeActionProviderRef = useRef<MonacoCodeActionDisposable | null>(null);
  const releaseHoverProviderRef = useRef<(() => void) | null>(null);
  const selectionChangeRef = useRef<MonacoDisposable | null>(null);
  const diagnosticsChangeRef = useRef<MonacoContentDisposable | null>(null);
  const diagnosticsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionLayoutDisposablesRef = useRef<MonacoDisposable[]>([]);
  const inlineDecorationIdsRef = useRef<string[]>([]);
  const languageRef = useRef(language);
  const decorationsVisibleRef = useRef(decorationsVisible);
  const onSelectionOverlayChangeRef = useRef(onSelectionOverlayChange);
  const onSyntaxErrorChangeRef = useRef(onSyntaxErrorChange);

  languageRef.current = language;
  decorationsVisibleRef.current = decorationsVisible;
  onSelectionOverlayChangeRef.current = onSelectionOverlayChange;
  onSyntaxErrorChangeRef.current = onSyntaxErrorChange;

  const runSsmlDiagnostics = useCallback((editor: MonacoEditor, monaco: Monaco): void => {
    const model = editor.getModel();
    if (!model) {
      onSyntaxErrorChangeRef.current(null);
      return;
    }

    onSyntaxErrorChangeRef.current(updateSsmlDiagnostics(monaco, model));
  }, []);

  const scheduleSsmlDiagnostics = useCallback(
    (editor: MonacoEditor, monaco: Monaco): void => {
      if (diagnosticsTimeoutRef.current !== null) {
        clearTimeout(diagnosticsTimeoutRef.current);
      }

      diagnosticsTimeoutRef.current = setTimeout(() => {
        diagnosticsTimeoutRef.current = null;
        runSsmlDiagnostics(editor, monaco);
      }, SSML_DIAGNOSTICS_DEBOUNCE_MS);
    },
    [runSsmlDiagnostics],
  );

  const clearSsmlDiagnosticsResources = useCallback((): void => {
    if (diagnosticsTimeoutRef.current !== null) {
      clearTimeout(diagnosticsTimeoutRef.current);
      diagnosticsTimeoutRef.current = null;
    }
    diagnosticsChangeRef.current?.dispose();
    diagnosticsChangeRef.current = null;
  }, []);

  const disposeMonacoResources = useCallback((): void => {
    clearSsmlDiagnosticsResources();
    const model = editorRef.current?.getModel();
    if (model && monacoRef.current) {
      clearSsmlDiagnostics(monacoRef.current, model);
      inlineDecorationIdsRef.current = model.deltaDecorations(inlineDecorationIdsRef.current, []);
    }
    selectionChangeRef.current?.dispose();
    selectionChangeRef.current = null;
    completionProviderRef.current?.dispose();
    completionProviderRef.current = null;
    codeActionProviderRef.current?.dispose();
    codeActionProviderRef.current = null;
    for (const disposable of selectionLayoutDisposablesRef.current) {
      disposable.dispose();
    }
    selectionLayoutDisposablesRef.current = [];
    releaseHoverProviderRef.current?.();
    releaseHoverProviderRef.current = null;
    editorRef.current = null;
    monacoRef.current = null;
  }, [clearSsmlDiagnosticsResources, editorRef]);

  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      disposeMonacoResources();
      editorRef.current = editor;
      monacoRef.current = monaco;
      selectionChangeRef.current = editor.onDidChangeCursorSelection(() => {
        onSelectionOverlayChangeRef.current(editor, true);
      });
      diagnosticsChangeRef.current = editor.onDidChangeModelContent(() => {
        const model = editor.getModel();
        if (model) {
          inlineDecorationIdsRef.current = syncSsmlInlineDecorations(
            model,
            model.getValue(),
            languageRef.current,
            decorationsVisibleRef.current,
            inlineDecorationIdsRef.current,
          );
        }
        scheduleSsmlDiagnostics(editor, monaco);
      });
      selectionLayoutDisposablesRef.current = [
        editor.onDidScrollChange(() => onSelectionOverlayChangeRef.current(editor, false)),
        editor.onDidLayoutChange(() => onSelectionOverlayChangeRef.current(editor, false)),
        editor.onDidContentSizeChange(() => onSelectionOverlayChangeRef.current(editor, false)),
      ];
      completionProviderRef.current = registerSsmlCompletionProvider(monaco);
      codeActionProviderRef.current = registerSsmlCodeActions(monaco);
      releaseHoverProviderRef.current = acquireSsmlHoverProvider(monaco, languageRef.current);
      runSsmlDiagnostics(editor, monaco);
      const model = editor.getModel();
      if (model) {
        inlineDecorationIdsRef.current = syncSsmlInlineDecorations(
          model,
          editor.getValue(),
          languageRef.current,
          decorationsVisibleRef.current,
          inlineDecorationIdsRef.current,
        );
      }
      onSelectionOverlayChangeRef.current(editor, true);
    },
    [disposeMonacoResources, editorRef, runSsmlDiagnostics, scheduleSsmlDiagnostics],
  );

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return;
    }

    releaseHoverProviderRef.current?.();
    releaseHoverProviderRef.current = acquireSsmlHoverProvider(monaco, language);
  }, [language]);

  const previousTextRef = useRef<string | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (editor && model && monaco) {
      const previousText = previousTextRef.current;
      previousTextRef.current = text;
      inlineDecorationIdsRef.current = syncSsmlInlineDecorations(
        model,
        text,
        language,
        decorationsVisible,
        inlineDecorationIdsRef.current,
      );
      if (previousText === null || previousText !== text) {
        scheduleSsmlDiagnostics(editor, monaco);
      }
    }
  }, [decorationsVisible, editorRef, language, scheduleSsmlDiagnostics, text]);

  useEffect(() => disposeMonacoResources, [disposeMonacoResources]);

  return { editorRef, onMount };
}
