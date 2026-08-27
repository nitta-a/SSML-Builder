// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import * as SSML_PRESETS from "./constants/ssmlPresets.ts";
// @ts-expect-error The Node strip-types test runner requires the explicit TypeScript extension.
import { SSML_HOVER_COPY, type SsmlEditorLocale } from "./locales.ts";

const {
  BREAK_STRENGTH_PRESETS,
  EMPHASIS_LEVEL_PRESETS,
  PHONEME_ALPHABET_PRESETS,
  PROSODY_RATE_VALUES,
  PROSODY_VOLUME_PRESETS,
  SILENCE_TYPE_PRESETS,
  SSML_PRESET_EXAMPLES,
  VISEME_TYPE_PRESETS,
} = SSML_PRESETS;

export interface SsmlParameterDefinition {
  name: string;
  description: string;
  aliases?: readonly string[];
  values?: readonly string[];
  example?: string;
}

export interface SsmlTagDefinition {
  name: string;
  description: string;
  aliases?: readonly string[];
  parameters: readonly SsmlParameterDefinition[];
}

export interface SsmlHoverRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export type SsmlHoverTargetKind = "tag" | "parameter" | "parameter-value";

export interface SsmlHoverTarget {
  kind: SsmlHoverTargetKind;
  tagName: string;
  isClosingTag: boolean;
  definition: SsmlTagDefinition;
  parameter?: SsmlParameterDefinition;
  range: SsmlHoverRange;
}

const SSML_TAG_DEFINITIONS: readonly SsmlTagDefinition[] = [
  {
    name: "voice",
    description: "Selects the voice and optional voice effect used to synthesize the enclosed text.",
    parameters: [
      {
        name: "name",
        description: "The voice name, such as `en-US-JennyNeural`.",
        example: "en-US-JennyNeural",
      },
      {
        name: "effect",
        description: "An optional voice effect, such as `eq_car`.",
      },
    ],
  },
  {
    name: "prosody",
    description: "Changes the speaking rate, pitch, volume, or pitch contour of the enclosed text.",
    parameters: [
      {
        name: "rate",
        description: "Controls speaking speed.",
        values: PROSODY_RATE_VALUES,
        example: SSML_PRESET_EXAMPLES.prosodyRate,
      },
      {
        name: "pitch",
        description: "Adjusts pitch using a named value, percentage, frequency, or semitone value.",
        example: SSML_PRESET_EXAMPLES.prosodyPitch,
      },
      {
        name: "volume",
        description: "Controls loudness using a named value, percentage, or decibel value.",
        values: PROSODY_VOLUME_PRESETS,
        example: SSML_PRESET_EXAMPLES.prosodyVolume,
      },
      {
        name: "contour",
        description: "Defines a sequence of relative pitch changes at positions in the text.",
        example: "(0%,+0st) (100%,+2st)",
      },
      {
        name: "range",
        description: "Adjusts the pitch range of the voice.",
        example: "+2st",
      },
    ],
  },
  {
    name: "break",
    description: "Inserts a pause between words or other spoken content.",
    parameters: [
      {
        name: "time",
        description: "The pause duration, for example `500ms` or `1s`.",
        example: SSML_PRESET_EXAMPLES.breakTime,
      },
      {
        name: "strength",
        description: "The relative pause strength.",
        values: BREAK_STRENGTH_PRESETS,
      },
    ],
  },
  {
    name: "mstts:express-as",
    aliases: ["express-as", "expressAs"],
    description: "Applies a speaking style, style degree, or role to the enclosed text.",
    parameters: [
      {
        name: "style",
        description: "The speaking style supported by the selected voice, such as `cheerful`.",
        example: SSML_PRESET_EXAMPLES.expressAsStyle,
      },
      {
        name: "styledegree",
        aliases: ["style-degree", "styleDegree"],
        description: "Controls the intensity of the selected speaking style.",
        example: "1.5",
      },
      {
        name: "role",
        description: "Changes the speaking role when supported by the selected voice.",
        example: "YoungAdultFemale",
      },
    ],
  },
  {
    name: "say-as",
    aliases: ["sayAs"],
    description: "Controls how the enclosed text is interpreted and spoken.",
    parameters: [
      {
        name: "interpret-as",
        description: "Specifies the interpretation, such as characters, digits, date, or time.",
        example: "characters",
      },
      {
        name: "format",
        description: "Provides a format hint for the selected interpretation.",
      },
      {
        name: "detail",
        description: "Provides an additional detail hint for the selected interpretation.",
      },
    ],
  },
  {
    name: "phoneme",
    description: "Replaces normal pronunciation with the supplied phonetic pronunciation.",
    parameters: [
      {
        name: "alphabet",
        description: "The phonetic alphabet used by the `ph` value.",
        values: PHONEME_ALPHABET_PRESETS,
        example: SSML_PRESET_EXAMPLES.phonemeAlphabet,
      },
      {
        name: "ph",
        description: "The phonetic pronunciation for the enclosed text.",
        example: "həˈloʊ",
      },
    ],
  },
  {
    name: "emphasis",
    description: "Adds emphasis to the enclosed text.",
    parameters: [
      {
        name: "level",
        description: "Controls the amount of emphasis.",
        values: EMPHASIS_LEVEL_PRESETS,
      },
    ],
  },
  {
    name: "audio",
    description: "Plays an audio file as part of the synthesized output.",
    parameters: [
      {
        name: "src",
        description: "The URI of the audio file.",
        example: "https://example.com/intro.wav",
      },
      {
        name: "desc",
        description: "Alternative text to use if the audio cannot be played.",
      },
      {
        name: "clipBegin",
        description: "The starting offset within the audio file.",
        example: "0s",
      },
      {
        name: "clipEnd",
        description: "The ending offset within the audio file.",
        example: "5s",
      },
      {
        name: "speed",
        description: "The playback speed of the audio file.",
        example: "1.0",
      },
      {
        name: "repeatCount",
        description: "The number of times to repeat the audio.",
        example: "2",
      },
      {
        name: "repeatDuration",
        description: "The total duration for which the audio may repeat.",
        example: "10s",
      },
      {
        name: "soundLevel",
        description: "The audio volume adjustment in decibels.",
        example: "-3dB",
      },
    ],
  },
  {
    name: "sub",
    description: "Substitutes the alias text when speaking the enclosed text.",
    parameters: [
      {
        name: "alias",
        description: "The text to speak instead of the enclosed text.",
        example: "World Wide Web",
      },
    ],
  },
  {
    name: "lang",
    description: "Changes the language used for the enclosed text.",
    parameters: [
      {
        name: "xml:lang",
        aliases: ["lang"],
        description: "The BCP-47 language tag.",
        example: "ja-JP",
      },
    ],
  },
  {
    name: "mark",
    description: "Inserts a custom marker into the synthesized audio stream.",
    parameters: [
      {
        name: "name",
        description: "The application-defined marker name.",
        example: "chapter-1",
      },
    ],
  },
  {
    name: "bookmark",
    description: "Inserts a bookmark marker into the synthesized audio stream.",
    parameters: [
      {
        name: "mark",
        description: "The application-defined bookmark name.",
        example: "chapter-1",
      },
    ],
  },
  {
    name: "lexicon",
    description: "Associates a pronunciation lexicon with the synthesized document.",
    parameters: [
      {
        name: "uri",
        description: "The URI of the pronunciation lexicon.",
        example: "https://example.com/lexicon.pls",
      },
    ],
  },
  {
    name: "p",
    description: "Groups text into a paragraph.",
    parameters: [],
  },
  {
    name: "s",
    description: "Groups text into a sentence.",
    parameters: [],
  },
  {
    name: "w",
    description: "Groups text into a word.",
    parameters: [],
  },
  {
    name: "mstts:silence",
    aliases: ["silence"],
    description: "Adds a specified silence before or after text or at a punctuation boundary.",
    parameters: [
      {
        name: "type",
        description: "The silence position or punctuation boundary.",
        values: SILENCE_TYPE_PRESETS,
      },
      {
        name: "value",
        description: "The silence duration, for example `300ms`.",
        example: SSML_PRESET_EXAMPLES.silenceValue,
      },
    ],
  },
  {
    name: "mstts:viseme",
    aliases: ["viseme"],
    description: "Requests viseme events for the synthesized audio.",
    parameters: [
      {
        name: "type",
        description: "The viseme event format.",
        values: VISEME_TYPE_PRESETS,
      },
    ],
  },
  {
    name: "mstts:audioduration",
    description: "Sets the target duration of synthesized audio.",
    parameters: [
      {
        name: "value",
        description: "The target duration, such as `10s`, `5000ms`, or `00:00:10`.",
        example: "10s",
      },
    ],
  },
] as const;

export { SSML_TAG_DEFINITIONS };

const definitionsByName = new Map<string, SsmlTagDefinition>();
for (const definition of SSML_TAG_DEFINITIONS) {
  definitionsByName.set(definition.name, definition);
  for (const alias of definition.aliases ?? []) {
    definitionsByName.set(alias, definition);
  }
}

interface TokenRange {
  start: number;
  end: number;
}

interface AttributeToken {
  name: TokenRange;
  value?: TokenRange;
}

interface TagToken {
  name: string;
  nameRange: TokenRange;
  start: number;
  end: number;
  closing: boolean;
  attributes: AttributeToken[];
}

function isXmlNameStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/.test(value);
}

function isXmlNameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_.:-]/.test(value);
}

function isXmlWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function positionToOffset(source: string, lineNumber: number, column: number): number | undefined {
  if (!Number.isInteger(lineNumber) || !Number.isInteger(column) || lineNumber < 1 || column < 1) {
    return undefined;
  }

  let lineStart = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const newline = source.indexOf("\n", lineStart);
    if (newline === -1) {
      return undefined;
    }
    lineStart = newline + 1;
  }

  const lineEnd = source.indexOf("\n", lineStart);
  const lineLength = lineEnd === -1 ? source.length - lineStart : lineEnd - lineStart;
  if (column > lineLength + 1) {
    return undefined;
  }

  return lineStart + column - 1;
}

function offsetToPosition(
  source: string,
  offset: number,
): {
  lineNumber: number;
  column: number;
} {
  const lastNewline = source.lastIndexOf("\n", offset - 1);
  const lineNumber = source.slice(0, offset).split("\n").length;
  return {
    lineNumber,
    column: offset - lastNewline,
  };
}

function toRange(source: string, token: TokenRange): SsmlHoverRange {
  const start = offsetToPosition(source, token.start);
  const end = offsetToPosition(source, token.end);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

function containsOffset(token: TokenRange, offset: number): boolean {
  return offset >= token.start && offset < token.end;
}

function findTagEnd(source: string, start: number): number | undefined {
  let quote: string | undefined;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return undefined;
}

function parseTag(source: string, start: number, contentEnd: number, tokenEnd: number): TagToken | undefined {
  let index = start + 1;
  let closing = false;
  if (source[index] === "/") {
    closing = true;
    index += 1;
  }

  while (index < contentEnd && isXmlWhitespace(source[index])) {
    index += 1;
  }
  if (!isXmlNameStart(source[index])) {
    return undefined;
  }

  const nameStart = index;
  index += 1;
  while (index < contentEnd && isXmlNameCharacter(source[index])) {
    index += 1;
  }
  const nameEnd = index;
  const attributes: AttributeToken[] = [];

  if (!closing) {
    while (index < contentEnd) {
      while (index < contentEnd && isXmlWhitespace(source[index])) {
        index += 1;
      }
      if (index >= contentEnd || source[index] === "/") {
        break;
      }
      if (!isXmlNameStart(source[index])) {
        index += 1;
        continue;
      }

      const attributeStart = index;
      index += 1;
      while (index < contentEnd && isXmlNameCharacter(source[index])) {
        index += 1;
      }
      const attributeEnd = index;
      while (index < contentEnd && isXmlWhitespace(source[index])) {
        index += 1;
      }

      let value: TokenRange | undefined;
      if (source[index] === "=") {
        index += 1;
        while (index < contentEnd && isXmlWhitespace(source[index])) {
          index += 1;
        }

        const quote = source[index];
        if (quote === '"' || quote === "'") {
          index += 1;
          const valueStart = index;
          while (index < contentEnd && source[index] !== quote) {
            index += 1;
          }
          value = { start: valueStart, end: index };
          if (index < contentEnd) {
            index += 1;
          }
        } else {
          const valueStart = index;
          while (index < contentEnd && !isXmlWhitespace(source[index]) && source[index] !== "/") {
            index += 1;
          }
          value = { start: valueStart, end: index };
        }
      }

      attributes.push({
        name: { start: attributeStart, end: attributeEnd },
        value,
      });
    }
  }

  return {
    name: source.slice(nameStart, nameEnd),
    nameRange: { start: nameStart, end: nameEnd },
    start,
    end: tokenEnd,
    closing,
    attributes,
  };
}

function findTagAtOffset(source: string, offset: number): TagToken | undefined {
  let searchStart = 0;
  while (searchStart < source.length) {
    const start = source.indexOf("<", searchStart);
    if (start === -1 || start > offset) {
      return undefined;
    }

    if (source.startsWith("<!--", start)) {
      const commentEnd = source.indexOf("-->", start + 4);
      const tokenEnd = commentEnd === -1 ? source.length : commentEnd + 3;
      if (offset < tokenEnd) {
        return undefined;
      }
      searchStart = tokenEnd;
      continue;
    }

    if (source.startsWith("<![CDATA[", start)) {
      const cdataEnd = source.indexOf("]]>", start + 9);
      const tokenEnd = cdataEnd === -1 ? source.length : cdataEnd + 3;
      if (offset < tokenEnd) {
        return undefined;
      }
      searchStart = tokenEnd;
      continue;
    }

    if (source.startsWith("<?", start)) {
      const processingEnd = source.indexOf("?>", start + 2);
      const tokenEnd = processingEnd === -1 ? source.length : processingEnd + 2;
      if (offset < tokenEnd) {
        return undefined;
      }
      searchStart = tokenEnd;
      continue;
    }

    const tagEnd = findTagEnd(source, start + 1);
    const contentEnd = tagEnd ?? source.length;
    const tokenEnd = tagEnd === undefined ? source.length : tagEnd + 1;
    if (offset < tokenEnd) {
      return parseTag(source, start, contentEnd, tokenEnd);
    }

    if (tagEnd === undefined) {
      return undefined;
    }
    searchStart = tokenEnd;
  }
  return undefined;
}

function findParameter(definition: SsmlTagDefinition, name: string): SsmlParameterDefinition | undefined {
  return definition.parameters.find(
    (parameter) => parameter.name === name || parameter.aliases?.includes(name) === true,
  );
}

export function getSsmlTagDefinition(name: string): SsmlTagDefinition | undefined {
  return definitionsByName.get(name);
}

export function findSsmlHoverTarget(source: string, lineNumber: number, column: number): SsmlHoverTarget | undefined {
  const offset = positionToOffset(source, lineNumber, column);
  if (offset === undefined) {
    return undefined;
  }

  const tag = findTagAtOffset(source, offset);
  if (!tag) {
    return undefined;
  }

  const definition = getSsmlTagDefinition(tag.name);
  if (!definition) {
    return undefined;
  }

  if (containsOffset(tag.nameRange, offset)) {
    return {
      kind: "tag",
      tagName: tag.name,
      isClosingTag: tag.closing,
      definition,
      range: toRange(source, tag.nameRange),
    };
  }

  for (const attribute of tag.attributes) {
    if (containsOffset(attribute.name, offset)) {
      const parameter = findParameter(definition, source.slice(attribute.name.start, attribute.name.end));
      if (!parameter) {
        return undefined;
      }
      return {
        kind: "parameter",
        tagName: tag.name,
        isClosingTag: tag.closing,
        definition,
        parameter,
        range: toRange(source, attribute.name),
      };
    }

    if (attribute.value && containsOffset(attribute.value, offset)) {
      const parameter = findParameter(definition, source.slice(attribute.name.start, attribute.name.end));
      if (!parameter) {
        return undefined;
      }
      return {
        kind: "parameter-value",
        tagName: tag.name,
        isClosingTag: tag.closing,
        definition,
        parameter,
        range: toRange(source, attribute.value),
      };
    }
  }

  return undefined;
}

function code(value: string): string {
  return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function formatParameter(parameter: SsmlParameterDefinition, tagName: string, locale: SsmlEditorLocale): string {
  const localizedParameter = SSML_HOVER_COPY[locale].tags[tagName]?.parameters[parameter.name];
  const description = localizedParameter?.description ?? parameter.description;
  const values =
    parameter.values && parameter.values.length > 0
      ? ` ${SSML_HOVER_COPY[locale].allowedValues}: ${parameter.values.map(code).join(", ")}.`
      : "";
  const example = parameter.example ? ` ${SSML_HOVER_COPY[locale].example}: ${code(parameter.example)}.` : "";
  return `- ${code(parameter.name)}: ${description}${values}${example}`;
}

export function formatSsmlHover(target: SsmlHoverTarget, locale: SsmlEditorLocale = "en"): string {
  const localizedTag = SSML_HOVER_COPY[locale].tags[target.definition.name];
  const tagTitle = localizedTag?.title ?? target.definition.name;
  const tagDescription = localizedTag?.description ?? target.definition.description;
  const tagSyntax = target.isClosingTag ? `</${target.tagName}>` : `<${target.tagName}>`;
  const lines = [`### ${code(tagSyntax)}`, "", `**${tagTitle}**`, "", tagDescription];

  if (target.parameter) {
    const localizedParameter = localizedTag?.parameters[target.parameter.name];
    const parameterTitle = localizedParameter?.title ?? target.parameter.name;
    const parameterDescription = localizedParameter?.description ?? target.parameter.description;
    lines.push("", `**${SSML_HOVER_COPY[locale].parameterHeading} ${code(parameterTitle)}**`, "", parameterDescription);
    if (target.parameter.values && target.parameter.values.length > 0) {
      lines.push("", `${SSML_HOVER_COPY[locale].allowedValues}: ${target.parameter.values.map(code).join(", ")}.`);
    }
    if (target.parameter.example) {
      lines.push("", `${SSML_HOVER_COPY[locale].example}: ${code(target.parameter.example)}.`);
    }
  } else if (target.definition.parameters.length > 0) {
    lines.push(
      "",
      `**${SSML_HOVER_COPY[locale].parametersHeading}**`,
      "",
      ...target.definition.parameters.map((parameter) => formatParameter(parameter, target.definition.name, locale)),
    );
  } else {
    lines.push("", SSML_HOVER_COPY[locale].noParameters);
  }

  return lines.join("\n");
}
