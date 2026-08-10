import { parseSsml } from "./parser.ts";

const PARSER_POSITION_SUFFIX = / at position (\d+)$/;

export interface SsmlValidationError {
  message: string;
  position: number;
}

export function validateSsml(xmlString: string): SsmlValidationError | null {
  try {
    parseSsml(xmlString);
    return null;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const positionMatch = PARSER_POSITION_SUFFIX.exec(rawMessage);

    return {
      message: positionMatch
        ? rawMessage.slice(0, positionMatch.index)
        : rawMessage,
      position: positionMatch ? Number.parseInt(positionMatch[1], 10) : 0,
    };
  }
}
