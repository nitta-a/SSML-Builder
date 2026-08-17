import assert from "node:assert/strict";
import test from "node:test";
import type { Monaco } from "@monaco-editor/react";
import { isSsmlEditorButtonVisible, type SsmlEditorButtonVisibility } from "../src/buttonVisibility.ts";
import { clearSsmlDocument } from "../src/clearSsmlDocument.ts";
import { EXPRESS_AS_STYLE_PRESETS, resolveExpressAsStyles } from "../src/constants/ssmlPresets.ts";
import { formatXml } from "../src/formatXml.ts";
import { registerSsmlCompletionProvider } from "../src/ssmlCompletion.ts";
import { findActiveSsmlTags, findSsmlVoiceContext, getEnclosingTagRange } from "../src/ssmlContext.ts";
import { SSML_TAG_DEFINITIONS, findSsmlHoverTarget, formatSsmlHover, getSsmlTagDefinition } from "../src/ssmlHover.ts";
import { createSsmlInsertionEdit } from "../src/ssmlInsertion.ts";

type CompletionProvider = Parameters<Monaco["languages"]["registerCompletionItemProvider"]>[1];
type CompletionMethod = NonNullable<CompletionProvider["provideCompletionItems"]>;
type CompletionModel = Parameters<CompletionMethod>[0];
type CompletionPosition = Parameters<CompletionMethod>[1];

function createCompletionProvider(outerVoiceName?: string, model?: CompletionModel): CompletionProvider {
  let provider: CompletionProvider | undefined;
  const monaco = {
    languages: {
      CompletionItemKind: { Snippet: 1, Value: 2 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: (_language: string, nextProvider: CompletionProvider) => {
        provider = nextProvider;
        return { dispose() {} };
      },
    },
  } as unknown as Monaco;

  registerSsmlCompletionProvider(monaco, { getOuterVoiceName: () => outerVoiceName, model });
  assert.ok(provider);
  return provider;
}

function createCompletionModel(source: string): CompletionModel {
  return {
    getValue: () => source,
    getOffsetAt: (position: CompletionPosition) => position.column - 1,
    getValueInRange: (range: { startColumn: number; endColumn: number }) =>
      source.slice(range.startColumn - 1, range.endColumn - 1),
  } as CompletionModel;
}

function getSuggestions(source: string, column = source.length + 1, outerVoiceName?: string) {
  const provider = createCompletionProvider(outerVoiceName);
  const model = createCompletionModel(source);
  const position = { lineNumber: 1, column } as CompletionPosition;
  const result = provider.provideCompletionItems?.(model, position);

  assert.ok(result && !(result instanceof Promise));
  return result.suggestions;
}

test("shows editor buttons by default and hides configured buttons", () => {
  const visibility: SsmlEditorButtonVisibility = {
    rate: false,
    format: true,
  };

  assert.equal(isSsmlEditorButtonVisible(undefined, "help"), true);
  assert.equal(isSsmlEditorButtonVisible(visibility, "rate"), false);
  assert.equal(isSsmlEditorButtonVisible(visibility, "pitch"), true);
  assert.equal(isSsmlEditorButtonVisible(visibility, "format"), true);
  assert.equal(isSsmlEditorButtonVisible({ "mstts:silence": false }, "mstts:silence"), false);
  assert.equal(isSsmlEditorButtonVisible({ customTag: false }, "customTag"), false);
});

test("provides attribute values from the active SSML tag and attribute", () => {
  const suggestions = getSuggestions('<prosody rate="');

  assert.equal(
    suggestions.some((suggestion) => suggestion.label === "x-slow" && suggestion.kind === 2),
    true,
  );
  assert.equal(
    suggestions.some((suggestion) => suggestion.label === "break"),
    false,
  );
});

test("supports single-quoted and case-insensitive attribute contexts", () => {
  const provider = createCompletionProvider();
  assert.deepEqual(provider.triggerCharacters, ["<", '"', "'"]);

  const suggestions = getSuggestions("<SAY-AS INTERPRET-AS='");
  assert.equal(
    suggestions.some((suggestion) => suggestion.label === "characters" && suggestion.kind === 2),
    true,
  );
});

test("resolves express-as styles by normalized voice name with compatible fallbacks", () => {
  assert.deepEqual(resolveExpressAsStyles("ja-JP-NanamiNeural"), ["cheerful", "chat", "customerservice"]);
  assert.deepEqual(resolveExpressAsStyles("  JA-jp-nanamineural  "), ["cheerful", "chat", "customerservice"]);
  assert.deepEqual(resolveExpressAsStyles("ja-JP-KeitaNeural"), []);
  assert.deepEqual(resolveExpressAsStyles(undefined), EXPRESS_AS_STYLE_PRESETS);
  assert.deepEqual(resolveExpressAsStyles("custom-Voice", ["custom", "cheerful"]), ["custom", "cheerful"]);
  assert.deepEqual(resolveExpressAsStyles("en-US-GuyNeural", ["custom", "friendly", "chat"]), ["friendly"]);
});

test("finds the innermost open voice at a source offset", () => {
  const source = '<voice name="outer"><prosody><voice name=\'inner\'>text</voice><mstts:express-as style="';

  assert.deepEqual(findSsmlVoiceContext(source, source.length), { voiceName: "outer" });
  assert.deepEqual(findSsmlVoiceContext(source, source.indexOf("text") + 2), { voiceName: "inner" });
  assert.deepEqual(findSsmlVoiceContext("<voice>text", "<voice>text".length), {});
});

test("filters express-as style completions by the effective voice", () => {
  const outerVoiceSuggestions = getSuggestions('<mstts:express-as style="', undefined, "ja-JP-NanamiNeural");
  assert.deepEqual(
    outerVoiceSuggestions.map((suggestion) => suggestion.label),
    ["cheerful", "chat", "customerservice"],
  );

  const innerVoiceSuggestions = getSuggestions(
    '<voice name="en-US-GuyNeural"><mstts:express-as style="',
    undefined,
    "ja-JP-KeitaNeural",
  );
  assert.equal(
    innerVoiceSuggestions.some((suggestion) => suggestion.label === "friendly"),
    true,
  );
  assert.equal(
    innerVoiceSuggestions.some((suggestion) => suggestion.label === "assistant"),
    false,
  );

  const unknownInnerVoiceSuggestions = getSuggestions(
    '<voice name="custom"><mstts:express-as style="',
    undefined,
    "ja-JP-KeitaNeural",
  );
  assert.equal(
    unknownInnerVoiceSuggestions.some((suggestion) => suggestion.label === "calm"),
    true,
  );
});

test("keeps non-style attribute completions independent of voice", () => {
  const suggestions = getSuggestions(
    '<voice name="ja-JP-KeitaNeural"><mstts:express-as role="',
    undefined,
    "ja-JP-KeitaNeural",
  );

  assert.equal(
    suggestions.some((suggestion) => suggestion.label === "Girl"),
    true,
  );
});

test("does not provide completion items for a different Monaco model", () => {
  const source = '<mstts:express-as style="';
  const provider = createCompletionProvider("en-US-JennyNeural", createCompletionModel(source));
  const result = provider.provideCompletionItems?.(
    createCompletionModel(source),
    { lineNumber: 1, column: source.length + 1 } as CompletionPosition,
    {} as never,
    {} as never,
  );

  assert.ok(result && !(result instanceof Promise));
  assert.deepEqual(result.suggestions, []);
});

test("ignores XML non-content and quoted brackets while finding voice context", () => {
  const source =
    '<?xml version="1.0"?><voice name="outer > inner"><!-- <voice name="comment"> --><![CDATA[<voice name="cdata">]]><prosody>text';

  assert.deepEqual(findSsmlVoiceContext(source, source.length), { voiceName: "outer > inner" });
  assert.equal(findSsmlVoiceContext('<voice name="closed"></voice><prosody>text', 44), undefined);
  assert.doesNotThrow(() => findSsmlVoiceContext('<voice name="unfinished', 24));
});

test("finds nested active SSML tags at the cursor", () => {
  const source = "<voice><prosody>text<emphasis>strong</emphasis></prosody></voice>";

  assert.deepEqual([...findActiveSsmlTags(source, source.indexOf("strong") + 2)], ["voice", "prosody", "emphasis"]);
  assert.deepEqual(
    [...findActiveSsmlTags(source, source.indexOf("</emphasis>") + 3)],
    ["voice", "prosody", "emphasis"],
  );
  assert.deepEqual([...findActiveSsmlTags(source, source.indexOf("</prosody>"))], ["voice", "prosody"]);
});

test("finds tags while the cursor is on opening and self-closing elements", () => {
  const source = '<voice><mstts:express-as style="chat">text</mstts:express-as><break time="500ms"/></voice>';
  const expressAsStart = source.indexOf("<mstts:express-as");
  const breakStart = source.indexOf("<break");
  const breakEnd = source.indexOf("/>", breakStart) + 2;

  assert.deepEqual([...findActiveSsmlTags(source, expressAsStart + 4)], ["voice", "mstts:express-as"]);
  assert.deepEqual([...findActiveSsmlTags(source, breakStart + 3)], ["voice", "break"]);
  assert.deepEqual([...findActiveSsmlTags(source, breakEnd)], ["voice"]);
});

test("ignores XML non-content and quoted brackets while finding active tags", () => {
  const source =
    '<?xml version="1.0"?><voice name="outer > inner"><!-- <prosody> --><![CDATA[<emphasis>]]><mstts:express-as>text';

  assert.deepEqual([...findActiveSsmlTags(source, source.length)], ["voice", "mstts:express-as"]);
});

test("finds the innermost enclosing tag and its opening and closing ranges", () => {
  const source = '<voice name="outer"><prosody rate="slow">text</prosody></voice>';
  const offset = source.indexOf("text") + 2;

  assert.deepEqual(getEnclosingTagRange(source, offset), {
    tagName: "prosody",
    openingTag: {
      start: source.indexOf("<prosody"),
      end: source.indexOf(">text") + 1,
    },
    closingTag: {
      start: source.indexOf("</prosody>"),
      end: source.indexOf("</prosody>") + "</prosody>".length,
    },
  });
  assert.equal(getEnclosingTagRange(source, offset, "voice")?.tagName, "voice");
  assert.equal(getEnclosingTagRange(source, source.length), null);
});

test("handles quoted brackets, non-content, and self-closing tags", () => {
  const source = '<?xml version="1.0"?><voice name="outer > inner"><!-- <prosody> --><break time="500ms"/>text</voice>';
  const breakStart = source.indexOf("<break");
  const breakEnd = source.indexOf("/>", breakStart) + 2;

  assert.deepEqual(getEnclosingTagRange(source, breakStart + 8), {
    tagName: "break",
    openingTag: { start: breakStart, end: breakEnd },
  });
  assert.equal(getEnclosingTagRange(source, source.indexOf("prosody") + 2, "prosody"), null);
});

test("replaces a typed opening bracket when selecting a tag completion", () => {
  const suggestions = getSuggestions("<");
  const subSuggestion = suggestions.find((suggestion) => suggestion.label === "sub");

  assert.deepEqual(subSuggestion?.range, {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 2,
  });
});

test("replaces a partially typed tag prefix when selecting a tag completion", () => {
  for (const [source, startColumn] of [
    ["<s", 1],
    ["<br", 1],
    ["text <s", 6],
  ] as const) {
    const suggestions = getSuggestions(source);
    const subSuggestion = suggestions.find((suggestion) => suggestion.label === "sub");

    assert.deepEqual(subSuggestion?.range, {
      startLineNumber: 1,
      startColumn,
      endLineNumber: 1,
      endColumn: source.length + 1,
    });
  }
});

test("does not provide opening-tag completions while typing a closing tag", () => {
  for (const source of ["</", "</p", "text </prosody"]) {
    const suggestions = getSuggestions(source);

    assert.deepEqual(suggestions, []);
  }
});

test("replaces an automatically inserted closing bracket after an opening bracket", () => {
  const suggestions = getSuggestions("<>", 2);
  const subSuggestion = suggestions.find((suggestion) => suggestion.label === "sub");

  assert.deepEqual(subSuggestion?.range, {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 3,
  });
});

test("keeps wrapped insertion tags inline and terminates them with a line break", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello world", 6, 11, {
      prefix: '<prosody rate="slow">',
      suffix: "</prosody>",
      mode: "wrap",
    }),
    {
      replacement: '<prosody rate="slow">world</prosody>\n',
      selectionOffset: '<prosody rate="slow">'.length,
    },
  );
});

test("places inserted elements on their own lines", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello world", 6, 11, {
      prefix: '<break time="500ms"/>',
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: '\n<break time="500ms"/>\nworld',
      selectionOffset: '\n<break time="500ms"/>\n'.length,
    },
  );
});

test("does not add duplicate line breaks at existing boundaries", () => {
  assert.deepEqual(
    createSsmlInsertionEdit("Hello\nworld", 6, 6, {
      prefix: '<break time="500ms"/>',
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: '<break time="500ms"/>\n',
      selectionOffset: '<break time="500ms"/>\n'.length,
    },
  );
});

test("uses the model line ending for insertion edits", () => {
  assert.deepEqual(
    createSsmlInsertionEdit(
      "Hello world",
      6,
      11,
      {
        prefix: '<break time="500ms"/>',
        suffix: "",
        mode: "insert",
      },
      "\r\n",
    ),
    {
      replacement: '\r\n<break time="500ms"/>\r\nworld',
      selectionOffset: '\r\n<break time="500ms"/>\r\n'.length,
    },
  );
});

test("uses the model line ending for wrapped insertion edits", () => {
  assert.deepEqual(
    createSsmlInsertionEdit(
      "Hello world",
      6,
      11,
      {
        prefix: '<prosody rate="slow">',
        suffix: "</prosody>",
        mode: "wrap",
      },
      "\r\n",
    ),
    {
      replacement: '<prosody rate="slow">world</prosody>\r\n',
      selectionOffset: '<prosody rate="slow">'.length,
    },
  );
});

test("does not duplicate an existing line ending after wrapped insertion", () => {
  const template = {
    prefix: '<prosody rate="slow">',
    suffix: "</prosody>",
    mode: "wrap" as const,
  };

  assert.deepEqual(createSsmlInsertionEdit("Hello\nworld\n", 6, 11, template), {
    replacement: '<prosody rate="slow">world</prosody>',
    selectionOffset: template.prefix.length,
  });
});

test("moves an empty insertion cursor past an existing line ending", () => {
  const tag = '<break time="500ms"/>';
  assert.deepEqual(
    createSsmlInsertionEdit("Hello\nworld", 5, 5, {
      prefix: tag,
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: `\n${tag}`,
      selectionOffset: `\n${tag}\n`.length,
    },
  );
});

test("terminates an insertion at the end of the document with a line ending", () => {
  const tag = '<break time="500ms"/>';
  assert.deepEqual(
    createSsmlInsertionEdit("Hello", 5, 5, {
      prefix: tag,
      suffix: "",
      mode: "insert",
    }),
    {
      replacement: `\n${tag}\n`,
      selectionOffset: `\n${tag}\n`.length,
    },
  );
});

test("defines the supported SSML tags", () => {
  assert.ok(SSML_TAG_DEFINITIONS.length > 0);
  assert.equal(getSsmlTagDefinition("prosody")?.name, "prosody");
  assert.equal(getSsmlTagDefinition("mstts:express-as")?.name, "mstts:express-as");
  assert.equal(getSsmlTagDefinition("express-as")?.name, "mstts:express-as");
});

test("finds a tag name and returns its range", () => {
  const target = findSsmlHoverTarget('<prosody rate="fast">Hello</prosody>', 1, 3);

  assert.equal(target?.kind, "tag");
  assert.equal(target?.tagName, "prosody");
  assert.deepEqual(target?.range, {
    startLineNumber: 1,
    startColumn: 2,
    endLineNumber: 1,
    endColumn: 9,
  });
});

test("finds attributes and quoted attribute values", () => {
  const source = '<prosody rate="fast" pitch="+2st">Hello</prosody>';
  const attribute = findSsmlHoverTarget(source, 1, 11);
  const value = findSsmlHoverTarget(source, 1, 17);

  assert.equal(attribute?.kind, "parameter");
  assert.equal(attribute?.parameter?.name, "rate");
  assert.deepEqual(attribute?.range, {
    startLineNumber: 1,
    startColumn: 10,
    endLineNumber: 1,
    endColumn: 14,
  });
  assert.equal(value?.kind, "parameter-value");
  assert.equal(value?.parameter?.name, "rate");
  assert.deepEqual(value?.range, {
    startLineNumber: 1,
    startColumn: 16,
    endLineNumber: 1,
    endColumn: 20,
  });
});

test("supports namespaced tags, hyphenated attributes, and closing tags", () => {
  const source = '<mstts:express-as style-degree="1.5">Hello</mstts:express-as>';
  const tag = findSsmlHoverTarget(source, 1, 5);
  const parameter = findSsmlHoverTarget(source, 1, 24);
  const closingTag = findSsmlHoverTarget(source, 1, 48);

  assert.equal(tag?.definition.name, "mstts:express-as");
  assert.equal(parameter?.parameter?.name, "styledegree");
  assert.equal(closingTag?.kind, "tag");
  assert.equal(closingTag?.isClosingTag, true);
});

test("supports multiline and incomplete start tags", () => {
  const source = '<prosody\n  rate="fa';
  const tag = findSsmlHoverTarget(source, 1, 4);
  const attribute = findSsmlHoverTarget(source, 2, 4);
  const value = findSsmlHoverTarget(source, 2, 10);

  assert.equal(tag?.tagName, "prosody");
  assert.equal(attribute?.parameter?.name, "rate");
  assert.equal(value?.kind, "parameter-value");
});

test("does not provide help for unknown tags, attributes, or text", () => {
  assert.equal(findSsmlHoverTarget('<custom answer="42">text</custom>', 1, 3), undefined);
  assert.equal(findSsmlHoverTarget('<prosody unknown="42">text</prosody>', 1, 11), undefined);
  assert.equal(findSsmlHoverTarget("<prosody>text</prosody>", 1, 11), undefined);
});

test("formats tag and parameter documentation as safe markdown", () => {
  const tag = findSsmlHoverTarget('<break strength="strong"/>', 1, 3);
  const parameter = findSsmlHoverTarget('<break strength="strong"/>', 1, 10);

  assert.ok(tag);
  assert.ok(parameter);
  assert.match(formatSsmlHover(tag), /Inserts a pause/);
  assert.match(formatSsmlHover(tag), /`strength`/);
  assert.match(formatSsmlHover(parameter), /\*\*Parameter `strength`\*\*/);
  assert.match(formatSsmlHover(parameter), /`strong`/);
  assert.doesNotMatch(formatSsmlHover(tag), /<script>/i);
});

test("formats hover documentation in the selected locale", () => {
  const target = findSsmlHoverTarget('<break strength="strong"/>', 1, 3);

  assert.ok(target);
  assert.match(formatSsmlHover(target, "ja"), /間/);
  assert.match(formatSsmlHover(target, "ja"), /単語やその他の音声コンテンツ/);
  assert.match(formatSsmlHover(target, "en"), /Break/);
  assert.match(formatSsmlHover(target, "en"), /Inserts a pause/);
});

test("formats nested XML with readable line breaks", () => {
  assert.equal(
    formatXml(
      '<speak version="1.0"><voice name="Jenny"><prosody rate="slow">Hello</prosody><break time="500ms"/></voice></speak>',
    ),
    '<speak version="1.0">\n  <voice name="Jenny">\n    <prosody rate="slow">Hello</prosody>\n    <break time="500ms"/>\n  </voice>\n</speak>',
  );
});

test("puts text-only SSML content on a readable line", () => {
  assert.equal(
    formatXml('<speak version="1.0" xml:lang="en-US">Welcome to the Builder .</speak>'),
    '<speak version="1.0" xml:lang="en-US">\n  Welcome to the Builder .\n</speak>',
  );
});

test("keeps formatted XML stable and handles empty input", () => {
  const formatted = "<root>\n  <child>text</child>\n</root>";

  assert.equal(formatXml(formatted), formatted);
  assert.equal(formatXml(" \n\t "), "");
});

test("preserves voice elements when clearing SSML markup", () => {
  const document = {
    type: "speak" as const,
    version: "1.0",
    lang: "en-US",
    children: [
      "Before ",
      {
        type: "voice" as const,
        name: "en-US-JennyNeural",
        effect: "eq_car",
        attributes: { "data-source": "test" },
        children: [
          {
            type: "prosody" as const,
            rate: "slow",
            children: ["Hello ", { type: "break" as const, time: "500ms" }, "world"],
          },
        ],
      },
      " after",
    ],
  };

  assert.deepEqual(clearSsmlDocument(document), {
    ...document,
    children: [
      "Before ",
      {
        type: "voice",
        name: "en-US-JennyNeural",
        effect: "eq_car",
        attributes: { "data-source": "test" },
        children: ["Hello world"],
      },
      " after",
    ],
  });
});
