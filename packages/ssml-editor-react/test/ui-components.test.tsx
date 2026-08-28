// @vitest-environment jsdom

import { useEffect, useRef, type ComponentProps } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEditableText, updateEditableText } from "../src/editableSsml";

const monacoState = vi.hoisted(() => {
  let value = "Hello world";
  let modelEol = "\n";
  let changeHandler: ((value: string) => void) | null = null;
  let selectionStartOffset = 0;
  let selectionEndOffset = 0;
  const contentChangeListeners = new Set<() => void>();
  const cursorPositionListeners = new Set<(event: { position: { lineNumber: number; column: number } }) => void>();
  let latestContentDispose: ReturnType<typeof vi.fn> | null = null;
  let latestCursorPositionDispose: ReturnType<typeof vi.fn> | null = null;
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
    getPosition: () => selection.getEndPosition(),
    getScrolledVisiblePosition: () => null,
    getLayoutInfo: () => ({ height: 100 }),
    onDidChangeCursorSelection: vi.fn(disposable),
    onDidChangeCursorPosition: vi.fn(
      (listener: (event: { position: { lineNumber: number; column: number } }) => void) => {
        cursorPositionListeners.add(listener);
        latestCursorPositionDispose = vi.fn(() => cursorPositionListeners.delete(listener));
        return { dispose: latestCursorPositionDispose };
      },
    ),
    onDidChangeModelContent: vi.fn((listener: () => void) => {
      contentChangeListeners.add(listener);
      latestContentDispose = vi.fn(() => contentChangeListeners.delete(listener));
      return { dispose: latestContentDispose };
    }),
    onDidScrollChange: vi.fn(disposable),
    onDidLayoutChange: vi.fn(disposable),
    onDidContentSizeChange: vi.fn(disposable),
    pushUndoStop: vi.fn(),
    executeEdits: vi.fn(
      (
        _source: string,
        edits: Array<{
          range:
            | typeof selection
            | {
                startLineNumber: number;
                startColumn: number;
                endLineNumber: number;
                endColumn: number;
              };
          text: string;
        }>,
      ) => {
        const edit = edits[0];
        if (edit) {
          const startOffset =
            "getStartPosition" in edit.range
              ? model.getOffsetAt(edit.range.getStartPosition())
              : model.getOffsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn });
          const endOffset =
            "getEndPosition" in edit.range
              ? model.getOffsetAt(edit.range.getEndPosition())
              : model.getOffsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn });
          value = `${value.slice(0, startOffset)}${edit.text}${value.slice(endOffset)}`;
        }
        return true;
      },
    ),
    setSelection: vi.fn(),
    focus: vi.fn(),
    trigger: vi.fn(),
    addAction: vi.fn(disposable),
  };
  const monaco = {
    languages: {
      registerHoverProvider: vi.fn(disposable),
      registerCompletionItemProvider: vi.fn(disposable),
      registerCodeActionProvider: vi.fn(disposable),
      registerCodeLensProvider: vi.fn(disposable),
      CompletionItemKind: {
        Snippet: 27,
        Value: 18,
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 4,
      },
    },
    editor: {
      registerCommand: vi.fn(disposable),
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
        editor.onDidChangeCursorPosition,
        editor.onDidChangeModelContent,
        editor.onDidScrollChange,
        editor.onDidLayoutChange,
        editor.onDidContentSizeChange,
        editor.pushUndoStop,
        editor.executeEdits,
        editor.setSelection,
        editor.focus,
        editor.trigger,
        editor.addAction,
        model.deltaDecorations,
        monaco.languages.registerHoverProvider,
        monaco.languages.registerCompletionItemProvider,
        monaco.languages.registerCodeActionProvider,
        monaco.languages.registerCodeLensProvider,
        monaco.editor.registerCommand,
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
      cursorPositionListeners.clear();
      latestContentDispose = null;
      latestCursorPositionDispose = null;
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
    emitCursorPositionChange: (offset: number) => {
      selectionStartOffset = offset;
      selectionEndOffset = offset;
      const position = positionAt(offset);
      for (const listener of cursorPositionListeners) {
        listener({ position });
      }
    },
    getLatestContentDispose: () => latestContentDispose,
    getLatestCursorPositionDispose: () => latestCursorPositionDispose,
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

function createVoiceDocument(name: string) {
  return {
    ...editorDocument,
    children: [
      {
        type: "voice" as const,
        name,
        children: ["Hello world"],
      },
    ],
  };
}

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

describe("editable SSML utilities", () => {
  it("keeps speak and voice wrappers outside the editable text", () => {
    const document = {
      type: "speak" as const,
      version: "1.0",
      lang: "en-US",
      children: [
        {
          type: "voice" as const,
          name: "en-US-JennyNeural",
          attributes: { "data-source": "test" },
          children: ["Hello"],
        },
      ],
    };

    expect(getEditableText(document)).toBe("Hello");
    expect(updateEditableText(document, "Updated")).toEqual({
      ...document,
      children: [
        {
          type: "voice",
          name: "en-US-JennyNeural",
          attributes: { "data-source": "test" },
          children: ["Updated"],
        },
      ],
    });
  });
});

describe("SsmlEditor toolbar menus", () => {
  it("registers a Monaco command for CodeLens actions", () => {
    renderEditor();

    expect(monacoState.monaco.editor.registerCommand).toHaveBeenCalledWith(
      "ssml-editor.codeLens",
      expect.any(Function),
    );
  });

  it("highlights prosody buttons while the cursor is inside a prosody element", () => {
    const value = '<prosody rate="slow">Hello</prosody> outside';
    monacoState.setValue(value);
    monacoState.setSelectionOffsets(value.length, value.length);
    renderEditor({ locale: "en" });

    const rateButton = screen.getByRole("button", { name: "Rate" });
    const pitchButton = screen.getByRole("button", { name: "Pitch" });
    const volumeButton = screen.getByRole("button", { name: "Volume" });

    expect(rateButton.style.backgroundColor).toBe("var(--ssml-editor-control-bg)");

    act(() => monacoState.emitCursorPositionChange(value.indexOf("Hello") + 2));

    expect(rateButton.style.backgroundColor).toBe("var(--ssml-editor-active-bg)");
    expect(rateButton.style.border).toBe("1px solid var(--ssml-editor-active-border)");
    expect(pitchButton.style.backgroundColor).toBe("var(--ssml-editor-active-bg)");
    expect(volumeButton.style.backgroundColor).toBe("var(--ssml-editor-active-bg)");
    expect(screen.getByRole("button", { name: "Emphasis" }).style.backgroundColor).toBe(
      "var(--ssml-editor-control-bg)",
    );

    act(() => monacoState.emitCursorPositionChange(value.length));

    expect(rateButton.style.backgroundColor).toBe("var(--ssml-editor-control-bg)");
    expect(rateButton.style.border).toBe("1px solid var(--ssml-editor-control-border)");
  });

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

  it("filters emotion options using the document voice outside Monaco", async () => {
    const user = userEvent.setup();
    renderEditor({ document: createVoiceDocument("ja-JP-NanamiNeural"), locale: "en" });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    const menu = screen.getByRole("menu", { name: "Emotion" });

    expect(within(menu).getByRole("menuitem", { name: "cheerful" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "chat" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "friendly" })).toBeNull();
  });

  it("filters Mayu emotion options to calm, cheerful, and sad", async () => {
    const user = userEvent.setup();
    renderEditor({ document: createVoiceDocument("ja-JP-MayuNeural"), locale: "en" });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    const menu = screen.getByRole("menu", { name: "Emotion" });

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((option) => option.textContent),
    ).toEqual(["cheerful", "calm", "sad"]);
  });

  it("groups emotion styles into localized menu sections and keeps custom styles in Other", async () => {
    const user = userEvent.setup();
    renderEditor({
      emotionStyles: ["cheerful", "chat", "newscast", "custom"],
      locale: "en",
    });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    const menu = screen.getByRole("menu", { name: "Emotion" });
    const groups = within(menu).getAllByRole("group");

    expect(groups.map((group) => group.querySelector("legend")?.textContent)).toEqual([
      "Emotions / Tone",
      "Conversations / Scenarios",
      "Media / Broadcast",
      "Other",
    ]);
    expect(within(menu).getByRole("group", { name: "Emotions / Tone" })).toBe(groups[0]);
    expect(within(groups[0] as HTMLElement).getByRole("menuitem", { name: "cheerful" })).toBeTruthy();
    expect(within(groups[1] as HTMLElement).getByRole("menuitem", { name: "chat" })).toBeTruthy();
    expect(within(groups[2] as HTMLElement).getByRole("menuitem", { name: "newscast" })).toBeTruthy();
    expect(within(groups[3] as HTMLElement).getByRole("menuitem", { name: "custom" })).toBeTruthy();
    expect(within(menu).queryByRole("combobox")).toBeNull();
  });

  it("uses an inner Monaco voice instead of the document voice", async () => {
    const user = userEvent.setup();
    const value = '<voice name="en-US-GuyNeural">Hello</voice>';
    monacoState.setValue(value);
    monacoState.setSelectionOffsets(value.indexOf("Hello") + 2, value.indexOf("Hello") + 2);
    renderEditor({ document: createVoiceDocument("ja-JP-KeitaNeural"), locale: "en" });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    const menu = screen.getByRole("menu", { name: "Emotion" });

    expect(within(menu).getByRole("menuitem", { name: "friendly" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "assistant" })).toBeNull();
  });

  it("intersects custom emotion styles with the active voice styles", async () => {
    const user = userEvent.setup();
    renderEditor({
      document: createVoiceDocument("ja-JP-NanamiNeural"),
      emotionStyles: ["friendly", "cheerful", "custom"],
      locale: "en",
    });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    const options = within(screen.getByRole("menu", { name: "Emotion" })).getAllByRole("menuitem");

    expect(options.map((option) => option.textContent)).toEqual(["cheerful"]);
  });

  it("shows a disabled localized option when the active voice supports no styles", async () => {
    const user = userEvent.setup();
    renderEditor({ document: createVoiceDocument("th-TH-PremwadeeNeural") });

    await user.click(screen.getByRole("button", { name: "感情" }));

    const menu = screen.getByRole("menu", { name: "感情" });
    const option = within(menu).getByRole("option", { name: "この音声はスタイル指定に対応していません" });
    expect((option as HTMLOptionElement).disabled).toBe(true);
  });

  it("refreshes emotion options after the document voice changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderEditor({ document: createVoiceDocument("ja-JP-NanamiNeural"), locale: "en" });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    expect(within(screen.getByRole("menu", { name: "Emotion" })).getByRole("menuitem", { name: "chat" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Emotion" }));

    rerender(<SsmlEditor document={createVoiceDocument("th-TH-PremwadeeNeural")} locale="en" />);
    await user.click(screen.getByRole("button", { name: "Emotion" }));

    const option = within(screen.getByRole("menu", { name: "Emotion" })).getByRole("option", {
      name: "This voice does not support style selection.",
    });
    expect((option as HTMLOptionElement).disabled).toBe(true);
  });

  it("inserts an emotion style allowed by the active voice", async () => {
    const user = userEvent.setup();
    monacoState.setSelectionOffsets(0, 5);
    renderEditor({ document: createVoiceDocument("ja-JP-NanamiNeural"), locale: "en" });

    await user.click(screen.getByRole("button", { name: "Emotion" }));
    await user.click(within(screen.getByRole("menu", { name: "Emotion" })).getByRole("menuitem", { name: "chat" }));

    expect(monacoState.editor.executeEdits.mock.calls[0]?.[1][0].text).toBe(
      '<mstts:express-as style="chat">Hello</mstts:express-as>\n',
    );
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
  it("renders the structured visual editor and exposes formatting controls", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ editMode: "visual", onChange });

    expect(screen.getByRole("navigation", { name: "SSML structure tree" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Text" })).toBeTruthy();
    await user.click(
      within(screen.getByRole("group", { name: "Apply SSML formatting" })).getByRole("button", { name: "Rate" }),
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ version: "1.0" }));
  });

  it("adds and edits Azure dialog turns in the visual editor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      editMode: "visual",
      onChange,
      document: {
        ...editorDocument,
        children: [
          {
            type: "voice",
            name: "en-US-MultiTalker-Ava-Andrew:DragonHDLatestNeural",
            children: [
              { type: "mstts:dialog", children: [{ type: "mstts:turn", speaker: "ava", children: ["Hello"] }] },
            ],
          },
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "<mstts:dialog>" }));
    await user.click(screen.getByRole("button", { name: "Add turn" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        children: [
          expect.objectContaining({
            children: [
              expect.objectContaining({
                children: expect.arrayContaining([expect.objectContaining({ type: "mstts:turn" })]),
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("provides forms for every supported Azure element", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      editMode: "visual",
      onChange,
      document: {
        ...editorDocument,
        children: [
          { type: "voice", name: "en-US-JennyNeural", children: ["Hello"] },
          { type: "prosody", rate: "slow", children: ["Hello"] },
          { type: "say-as", interpretAs: "cardinal", children: ["1"] },
          { type: "phoneme", alphabet: "ipa", ph: "həˈloʊ", children: ["Hello"] },
          { type: "audio", src: "https://allowed.test/a.mp3" },
          { type: "mark", name: "chapter-1" },
          { type: "bookmark", mark: "chapter-1" },
          { type: "mstts:silence", typeValue: "Comma", value: "100ms" },
          { type: "mstts:audioduration", value: "10s" },
          { type: "mstts:embedding", id: "speaker-1" },
          { type: "mstts:voiceconversion", url: "https://allowed.test/profile" },
        ],
      },
    });

    const tree = screen.getByRole("navigation", { name: "SSML structure tree" });
    const expectedFields = [
      ["<voice>", "Voice name"],
      ["<prosody>", "Rate"],
      ["<say-as>", "Interpret as"],
      ["<phoneme>", "Alphabet"],
      ["<audio>", "Source URL"],
      ["<mark>", "Mark name"],
      ["<bookmark>", "Bookmark name"],
      ["<mstts:silence>", "Silence type"],
      ["<mstts:audioduration>", "Duration"],
      ["<mstts:embedding>", "Embedding ID"],
      ["<mstts:voiceconversion>", "Source URL"],
    ];

    for (const [element, field] of expectedFields) {
      await user.click(within(tree).getByRole("button", { name: element }));
      expect(screen.getByLabelText(field)).toBeTruthy();
    }

    await user.click(within(tree).getByRole("button", { name: "<mstts:embedding>" }));
    await user.clear(screen.getByLabelText("Embedding ID"));
    await user.type(screen.getByLabelText("Embedding ID"), "speaker-2");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        children: expect.arrayContaining([expect.objectContaining({ type: "mstts:embedding", id: "speaker-2" })]),
      }),
    );
  });

  it("retains voice and prosody context for visual selection preview", async () => {
    const user = userEvent.setup();
    const onPreviewSelection = vi.fn();
    renderEditor({
      editMode: "visual",
      onPreviewSelection,
      document: {
        ...editorDocument,
        children: [
          {
            type: "voice",
            name: "en-US-JennyNeural",
            children: [{ type: "prosody", rate: "slow", children: ["Hello world"] }],
          },
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "Preview selection" }));
    expect(onPreviewSelection).toHaveBeenCalledWith(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-JennyNeural"><prosody rate="slow">Hello world</prosody></voice></speak>',
    );
  });

  it("edits Azure background audio settings in the visual editor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      editMode: "visual",
      onChange,
      document: {
        ...editorDocument,
        children: [
          { type: "mstts:backgroundaudio", src: "https://allowed.test/music.mp3", volume: "50", fadeIn: "500" },
          { type: "voice", name: "en-US-JennyNeural", children: ["Hello"] },
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "<mstts:backgroundaudio>" }));
    await user.clear(screen.getByRole("textbox", { name: "Volume" }));
    await user.type(screen.getByRole("textbox", { name: "Volume" }), "70");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        children: expect.arrayContaining([expect.objectContaining({ type: "mstts:backgroundaudio", volume: "70" })]),
      }),
    );
  });

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

  it("allows CodeLens quick controls to be disabled", () => {
    renderEditor({ enableCodeLens: false });
    expect(monacoState.monaco.languages.registerCodeLensProvider).not.toHaveBeenCalled();
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
    const actions = result && !(result instanceof Promise) ? result.actions : [];

    expect(marker?.code).toBe("MISSING_TIME_UNIT");
    expect(actions).toEqual([
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

    const edit = actions[0]?.edit?.edits[0];
    if (edit && "textEdit" in edit) {
      monacoState.editor.executeEdits("ssml-code-action", [
        {
          range: edit.textEdit.range,
          text: edit.textEdit.text,
        },
      ]);
    }
    expect(monacoState.getValue()).toBe('<break time="500ms"/>');
  });

  it("offers a preferred quick fix for an unclosed tag", () => {
    monacoState.setValue("<voice>Hello");
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
    const actions = result && !(result instanceof Promise) ? result.actions : [];

    expect(marker?.code).toEqual({ value: "UNCLOSED_TAG", target: "voice" });
    expect(actions).toEqual([
      expect.objectContaining({
        title: '閉じタグ "</voice>" を自動挿入',
        kind: "quickfix",
        isPreferred: true,
        edit: expect.objectContaining({
          edits: [
            expect.objectContaining({
              textEdit: expect.objectContaining({
                range: {
                  startLineNumber: marker?.endLineNumber,
                  startColumn: marker?.endColumn,
                  endLineNumber: marker?.endLineNumber,
                  endColumn: marker?.endColumn,
                },
                text: "</voice>",
              }),
            }),
          ],
        }),
      }),
    ]);

    const edit = actions[0]?.edit?.edits[0];
    if (edit && "textEdit" in edit) {
      monacoState.editor.executeEdits("ssml-code-action", [
        {
          range: edit.textEdit.range,
          text: edit.textEdit.text,
        },
      ]);
    }
    expect(monacoState.getValue()).toBe("<voice>Hello</voice>");
  });

  it("offers a preferred quick fix for an invalid attribute value", () => {
    monacoState.setValue('<prosody rate="invalid">Hello</prosody>');
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
    const actions = result && !(result instanceof Promise) ? result.actions : [];

    expect(marker?.code).toEqual({ value: "INVALID_ATTR_VALUE", suggestedValue: "x-fast" });
    expect(actions).toEqual([
      expect.objectContaining({
        title: '"x-fast" に変更',
        kind: "quickfix",
        isPreferred: true,
        edit: expect.objectContaining({
          edits: [
            expect.objectContaining({
              textEdit: expect.objectContaining({
                text: "x-fast",
                range: {
                  startLineNumber: marker?.startLineNumber,
                  startColumn: marker?.startColumn,
                  endLineNumber: marker?.endLineNumber,
                  endColumn: marker?.endColumn,
                },
              }),
            }),
          ],
        }),
      }),
    ]);

    const edit = actions[0]?.edit?.edits[0];
    if (edit && "textEdit" in edit) {
      monacoState.editor.executeEdits("ssml-code-action", [
        {
          range: edit.textEdit.range,
          text: edit.textEdit.text,
        },
      ]);
    }
    expect(monacoState.getValue()).toBe('<prosody rate="x-fast">Hello</prosody>');
  });

  it("cleans up the diagnostics listener and pending timer on unmount", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderEditor();
      const contentDispose = monacoState.getLatestContentDispose();
      const cursorPositionDispose = monacoState.getLatestCursorPositionDispose();
      const codeActionDispose = monacoState.monaco.languages.registerCodeActionProvider.mock.results[0]?.value.dispose;

      expect(contentDispose).not.toBeNull();
      expect(cursorPositionDispose).not.toBeNull();
      expect(codeActionDispose).toBeDefined();
      monacoState.setValue("<voice>");
      monacoState.emitContentChange();
      unmount();

      expect(contentDispose).toHaveBeenCalledTimes(1);
      expect(cursorPositionDispose).toHaveBeenCalledTimes(1);
      expect(codeActionDispose).toHaveBeenCalledTimes(1);
      const markerCallCountAfterUnmount = monacoState.monaco.editor.setModelMarkers.mock.calls.length;
      vi.advanceTimersByTime(300);
      expect(monacoState.monaco.editor.setModelMarkers).toHaveBeenCalledTimes(markerCallCountAfterUnmount);
    } finally {
      vi.useRealTimers();
    }
  });
});
