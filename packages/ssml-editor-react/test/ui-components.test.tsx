// @vitest-environment jsdom

import { useEffect, useRef, type ComponentProps } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monacoState = vi.hoisted(() => {
  let value = "Hello world";
  let modelEol = "\n";
  let changeHandler: ((value: string) => void) | null = null;
  let selectionStartOffset = 0;
  let selectionEndOffset = 0;
  const contentChangeListeners = new Set<() => void>();
  let latestContentDispose: ReturnType<typeof vi.fn> | null = null;
  const positionAt = (offset: number) => {
    const lines = value.slice(0, offset).split(/\r\n|\r|\n/);
    return {
      lineNumber: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    };
  };
  const selection = {
    selectionStartLineNumber: 1,
    selectionStartColumn: 1,
    positionLineNumber: 1,
    positionColumn: 1,
    getStartPosition: () => positionAt(selectionStartOffset),
    getEndPosition: () => positionAt(selectionEndOffset),
    isEmpty: () => selectionStartOffset === selectionEndOffset,
  };
  const model = {
    getValue: () => value,
    getPositionAt: positionAt,
    getOffsetAt: (position: { lineNumber: number; column: number }) => {
      const lines = value.split(/\r\n|\r|\n/);
      return (
        lines.slice(0, position.lineNumber - 1).reduce((offset, line) => offset + line.length + modelEol.length, 0) +
        position.column -
        1
      );
    },
    getEOL: () => modelEol,
    getValueInRange: (
      range:
        | typeof selection
        | {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
          },
    ) => {
      const startOffset =
        "getStartPosition" in range
          ? model.getOffsetAt(range.getStartPosition())
          : model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
      const endOffset =
        "getEndPosition" in range
          ? model.getOffsetAt(range.getEndPosition())
          : model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });
      return value.slice(startOffset, endOffset);
    },
    getLineContent: (lineNumber: number) => value.split(/\r\n|\r|\n/)[lineNumber - 1] ?? "",
    deltaDecorations: vi.fn(() => []),
    uri: {},
    getVersionId: () => 1,
  };
  const disposable = () => ({ dispose: vi.fn() });
  const editor = {
    getModel: () => model,
    getValue: () => value,
    getSelection: () => selection,
    getScrolledVisiblePosition: () => null,
    getLayoutInfo: () => ({ height: 100 }),
    onDidChangeCursorSelection: vi.fn(disposable),
    onDidChangeModelContent: vi.fn((listener: () => void) => {
      contentChangeListeners.add(listener);
      latestContentDispose = vi.fn(() => contentChangeListeners.delete(listener));
      return { dispose: latestContentDispose };
    }),
    onDidScrollChange: vi.fn(disposable),
    onDidLayoutChange: vi.fn(disposable),
    onDidContentSizeChange: vi.fn(disposable),
    pushUndoStop: vi.fn(),
    executeEdits: vi.fn((_source: string, edits: Array<{ range: typeof selection; text: string }>) => {
      const edit = edits[0];
      if (edit) {
        const startOffset = model.getOffsetAt(edit.range.getStartPosition());
        const endOffset = model.getOffsetAt(edit.range.getEndPosition());
        value = `${value.slice(0, startOffset)}${edit.text}${value.slice(endOffset)}`;
      }
      return true;
    }),
    setSelection: vi.fn(),
    focus: vi.fn(),
    trigger: vi.fn(),
  };
  const monaco = {
    languages: {
      registerHoverProvider: vi.fn(disposable),
      registerCompletionItemProvider: vi.fn(disposable),
      registerCodeActionProvider: vi.fn(disposable),
      CompletionItemKind: {
        Snippet: 27,
        Value: 18,
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 4,
      },
    },
    editor: {
      setModelMarkers: vi.fn(),
    },
    MarkerSeverity: {
      Error: 8,
    },
  };

  return {
    editor,
    monaco,
    reset: () => {
      for (const mock of [
        editor.onDidChangeCursorSelection,
        editor.onDidChangeModelContent,
        editor.onDidScrollChange,
        editor.onDidLayoutChange,
        editor.onDidContentSizeChange,
        editor.pushUndoStop,
        editor.executeEdits,
        editor.setSelection,
        editor.focus,
        editor.trigger,
        model.deltaDecorations,
        monaco.languages.registerHoverProvider,
        monaco.languages.registerCompletionItemProvider,
        monaco.languages.registerCodeActionProvider,
        monaco.editor.setModelMarkers,
      ]) {
        mock.mockClear();
      }
      value = "Hello world";
      modelEol = "\n";
      changeHandler = null;
      selectionStartOffset = 0;
      selectionEndOffset = 0;
      contentChangeListeners.clear();
      latestContentDispose = null;
    },
    setValue: (nextValue: string) => {
      value = nextValue;
    },
    setSelectionOffsets: (startOffset: number, endOffset: number) => {
      selectionStartOffset = startOffset;
      selectionEndOffset = endOffset;
    },
    getValue: () => value,
    setEOL: (nextEol: string) => {
      modelEol = nextEol;
    },
    setChangeHandler: (handler: ((value: string) => void) | undefined) => {
      changeHandler = handler ?? null;
    },
    emitContentChange: (nextValue?: string) => {
      if (nextValue !== undefined) {
        value = nextValue;
      }
      changeHandler?.(value);
      for (const listener of contentChangeListeners) {
        listener();
      }
    },
    getLatestContentDispose: () => latestContentDispose,
  };
});

vi.mock("@ssml-builder-js/ssml-core", async () => import("../../ssml-core/src/index"));

vi.mock("@monaco-editor/react", () => ({
  default: function MockEditor({
    options,
    onMount,
    onChange,
  }: {
    options?: {
      autoClosingBrackets?: string;
      inlayHints?: { enabled?: string };
    };
    onMount?: (editor: typeof monacoState.editor, monaco: typeof monacoState.monaco) => void;
    onChange?: (value: string) => void;
  }) {
    const mounted = useRef(false);
    monacoState.setChangeHandler(onChange);
    useEffect(() => {
      if (!mounted.current) {
        mounted.current = true;
        onMount?.(monacoState.editor, monacoState.monaco);
      }
    }, [onMount]);

    return (
      <div
        data-testid="monaco-editor"
        data-auto-closing-brackets={options?.autoClosingBrackets}
        data-inlay-hints={options?.inlayHints?.enabled}
      />
    );
  },
}));

import { SsmlEditor } from "../src/SsmlEditor";

const editorDocument = {
  type: "speak" as const,
  version: "1.0" as const,
  lang: "en-US",
  children: ["Hello world"],
};

function renderEditor(props: Partial<ComponentProps<typeof SsmlEditor>> = {}) {
  return render(<SsmlEditor document={editorDocument} {...props} />);
}

beforeEach(() => {
  monacoState.reset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
});

describe("SsmlEditor toolbar menus", () => {
  it("opens the break, prosody, and express-as popovers", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en" });

    for (const label of ["Break", "Rate", "Emotion"]) {
      const trigger = screen.getByRole("button", { name: label });
      await user.click(trigger);

      expect(screen.getByRole("menu", { name: label })).toBeTruthy();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");

      await user.click(trigger);
      expect(screen.queryByRole("menu", { name: label })).toBeNull();
    }
  });

  it("inserts a tag and closes the popover when an option is clicked", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en" });

    await user.click(screen.getByRole("button", { name: "Break" }));
    const menu = screen.getByRole("menu", { name: "Break" });
    await user.click(within(menu).getByRole("menuitem", { name: "500ms" }));

    expect(monacoState.editor.executeEdits).toHaveBeenCalledTimes(1);
    expect(monacoState.editor.executeEdits.mock.calls[0]?.[1][0].text).toContain('<break time="500ms"/>');
    expect(monacoState.editor.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionStartLineNumber: 2,
        positionLineNumber: 2,
        selectionStartColumn: 1,
        positionColumn: 1,
      }),
    );
    expect(screen.queryByRole("menu", { name: "Break" })).toBeNull();
  });

  it("wraps selected text when a wrapping tag option is clicked", async () => {
    const user = userEvent.setup();
    monacoState.setSelectionOffsets(6, 11);
    renderEditor({ locale: "en" });

    await user.click(screen.getByRole("button", { name: "Rate" }));
    const menu = screen.getByRole("menu", { name: "Rate" });
    await user.click(within(menu).getByRole("menuitem", { name: "slow" }));

    expect(monacoState.editor.executeEdits.mock.calls[0]?.[1][0].text).toBe('<prosody rate="slow">world</prosody>\n');
    expect(monacoState.getValue()).toBe('Hello <prosody rate="slow">world</prosody>\n');
  });

  it("inserts a tag and closes the popover when Enter is pressed", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en" });

    await user.click(screen.getByRole("button", { name: "Rate" }));
    const option = within(screen.getByRole("menu", { name: "Rate" })).getByRole("menuitem", { name: "slow" });
    option.focus();
    await user.keyboard("{Enter}");

    expect(monacoState.editor.executeEdits).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Rate" })).toBeNull();
  });

  it("closes an open popover with Escape or an outside click", async () => {
    const user = userEvent.setup();
    renderEditor({ locale: "en" });

    const breakTrigger = screen.getByRole("button", { name: "Break" });
    await user.click(breakTrigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Break" })).toBeNull();
    expect(breakTrigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(breakTrigger);
    expect(screen.getByRole("menu", { name: "Break" })).toBeTruthy();
    await user.click(document.body);
    expect(screen.queryByRole("menu", { name: "Break" })).toBeNull();
  });
});

describe("SsmlEditor props", () => {
  it("updates toolbar and popover text when the locale changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderEditor({ locale: "ja", showToolbarLabels: true });

    expect(screen.getByRole("button", { name: "間" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "間" }));
    const japaneseMenu = screen.getByRole("menu", { name: "間" });
    expect(within(japaneseMenu).getByRole("menuitem", { name: "500ms" }).getAttribute("title")).toBe("500ミリ秒の無音");
    await user.click(screen.getByRole("button", { name: "間" }));

    rerender(<SsmlEditor document={editorDocument} locale="en" showToolbarLabels />);

    const englishTrigger = screen.getByRole("button", { name: "Break" });
    expect(englishTrigger).toBeTruthy();
    expect(screen.queryByRole("button", { name: "間" })).toBeNull();
    await user.click(englishTrigger);
    const englishMenu = screen.getByRole("menu", { name: "Break" });
    expect(within(englishMenu).getByRole("menuitem", { name: "500ms" }).getAttribute("title")).toBe(
      "Inserts 500 milliseconds of silence.",
    );
  });

  it("keeps empty pair tags editable after a model content change", () => {
    const onSsmlChange = vi.fn();
    renderEditor({
      document: {
        type: "speak",
        version: "1.0",
        lang: "ja-JP",
        children: ["<emphasis></emphasis>"],
      },
      onSsmlChange,
    });

    act(() => {
      monacoState.emitContentChange("<emphasis></emphasis>");
    });

    expect(monacoState.editor.getValue()).toBe("<emphasis></emphasis>");
    expect(onSsmlChange).toHaveBeenLastCalledWith(expect.stringContaining("<emphasis></emphasis>"));

    act(() => {
      monacoState.emitContentChange("<emphasis>テキスト</emphasis>");
    });

    expect(monacoState.editor.getValue()).toBe("<emphasis>テキスト</emphasis>");
    expect(onSsmlChange).toHaveBeenLastCalledWith(expect.stringContaining("<emphasis>テキスト</emphasis>"));
  });

  it("reflects showDecorations in the Monaco editor settings", async () => {
    const { rerender } = renderEditor({ showDecorations: false });
    expect(screen.getByTestId("monaco-editor").getAttribute("data-inlay-hints")).toBe("off");
    expect(screen.getByRole("switch", { name: "装飾" }).getAttribute("aria-checked")).toBe("false");

    rerender(<SsmlEditor document={editorDocument} showDecorations />);

    expect(screen.getByTestId("monaco-editor").getAttribute("data-inlay-hints")).toBe("on");
    expect(screen.getByRole("switch", { name: "装飾" }).getAttribute("aria-checked")).toBe("true");
  });

  it("disables automatic bracket closing for SSML completion", () => {
    renderEditor();

    expect(screen.getByTestId("monaco-editor").getAttribute("data-auto-closing-brackets")).toBe("never");
  });

  it("does not render the toolbar when showToolbar is false", () => {
    renderEditor({ showToolbar: false });

    expect(screen.queryByRole("toolbar", { name: "SSMLツールバー" })).toBeNull();
    expect(screen.getByTestId("monaco-editor")).toBeTruthy();
  });

  it("debounces diagnostics after Monaco model content changes", () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const initialMarkerCallCount = monacoState.monaco.editor.setModelMarkers.mock.calls.length;

      monacoState.setValue("<voice>");
      monacoState.emitContentChange();

      vi.advanceTimersByTime(299);
      expect(monacoState.monaco.editor.setModelMarkers).toHaveBeenCalledTimes(initialMarkerCallCount);

      vi.advanceTimersByTime(1);
      expect(monacoState.monaco.editor.setModelMarkers).toHaveBeenCalledTimes(initialMarkerCallCount + 1);
      expect(monacoState.monaco.editor.setModelMarkers.mock.lastCall?.[1]).toBe("ssml");
      expect(monacoState.monaco.editor.setModelMarkers.mock.lastCall?.[2]).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a preferred quick fix for a missing time unit", () => {
    monacoState.setValue('<break time="500"/>');
    renderEditor();

    const marker = monacoState.monaco.editor.setModelMarkers.mock.lastCall?.[2]?.[0];
    const provider = monacoState.monaco.languages.registerCodeActionProvider.mock.lastCall?.[1];
    const result = provider?.provideCodeActions?.(
      monacoState.editor.getModel(),
      marker ?? {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      },
      { markers: marker ? [marker] : [], trigger: 1 },
      {} as never,
    );

    expect(marker?.code).toBe("MISSING_TIME_UNIT");
    expect(result && !(result instanceof Promise) ? result.actions : []).toEqual([
      expect.objectContaining({
        title: '単位 "ms" を付与して修復',
        kind: "quickfix",
        isPreferred: true,
        edit: expect.objectContaining({
          edits: [
            expect.objectContaining({
              textEdit: expect.objectContaining({ text: "500ms" }),
            }),
          ],
        }),
      }),
    ]);
  });

  it("cleans up the diagnostics listener and pending timer on unmount", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderEditor();
      const contentDispose = monacoState.getLatestContentDispose();
      const codeActionDispose = monacoState.monaco.languages.registerCodeActionProvider.mock.results[0]?.value.dispose;

      expect(contentDispose).not.toBeNull();
      expect(codeActionDispose).toBeDefined();
      monacoState.setValue("<voice>");
      monacoState.emitContentChange();
      unmount();

      expect(contentDispose).toHaveBeenCalledTimes(1);
      expect(codeActionDispose).toHaveBeenCalledTimes(1);
      const markerCallCountAfterUnmount = monacoState.monaco.editor.setModelMarkers.mock.calls.length;
      vi.advanceTimersByTime(300);
      expect(monacoState.monaco.editor.setModelMarkers).toHaveBeenCalledTimes(markerCallCountAfterUnmount);
    } finally {
      vi.useRealTimers();
    }
  });
});
