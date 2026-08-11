import type { SsmlNode } from "@ssml-builder/ssml-core";

export function containsVoiceTag(nodes: readonly SsmlNode[]): boolean {
  return nodes.some((node) => {
    if (typeof node === "string" || node.type === "text") {
      return false;
    }

    return node.type === "voice" || containsVoiceTag(node.children ?? []);
  });
}
