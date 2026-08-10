const XML_TAG_BOUNDARY = />\s*</g;

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
