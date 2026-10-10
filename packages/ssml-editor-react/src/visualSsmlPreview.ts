import { buildSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument, SsmlElement, SsmlNode } from "@ssml-builder-js/ssml-core";

export function getElementAncestors(
  nodes: readonly SsmlNode[],
  path: readonly number[],
  ancestors: SsmlElement[] = [],
): SsmlElement[] {
  const [index, ...rest] = path;
  const node = nodes[index];
  if (!node || typeof node === "string" || node.type === "text") return ancestors;
  if (rest.length === 0) return ancestors;
  return getElementAncestors(node.children ?? [], rest, [...ancestors, node]);
}

export function buildVisualPreview(
  document: SsmlDocument,
  leaf: { path: readonly number[]; value: string },
  selection: { start: number; end: number },
): string {
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
