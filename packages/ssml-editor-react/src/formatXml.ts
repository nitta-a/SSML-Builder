const XML_TAG_BOUNDARY = />\s*</g;
const ROOT_TEXT_ELEMENT = /^(<([A-Za-z_][A-Za-z0-9_.:-]*)(?:\s[^>]*)?>)([^<]+)(<\/\2>)$/;

function isOpeningTag(line: string): boolean {
  return (
    line.startsWith("<") &&
    !line.startsWith("</") &&
    !line.startsWith("<?") &&
    !line.startsWith("<!") &&
    !line.endsWith("/>") &&
    !line.includes("</")
  );
}

export function formatXml(xml: string): string {
  const source = xml.trim();
  if (source === "") {
    return "";
  }

  let depth = 0;
  const lines: string[] = [];

  for (const line of source.replace(XML_TAG_BOUNDARY, ">\n<").split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine === "") {
      continue;
    }

    const rootTextMatch = depth === 0 ? trimmedLine.match(ROOT_TEXT_ELEMENT) : null;
    if (rootTextMatch) {
      lines.push(`${rootTextMatch[1]}\n  ${rootTextMatch[3].trim()}\n${rootTextMatch[4]}`);
      continue;
    }

    if (trimmedLine.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    }

    lines.push(`${"  ".repeat(depth)}${trimmedLine}`);

    if (isOpeningTag(trimmedLine)) {
      depth += 1;
    }
  }

  return lines.join("\n");
}
