import type { SsmlDocument, SsmlNode } from "@ssml-builder/ssml-core";

function getDocumentChildren(document: SsmlDocument): SsmlNode[] {
  return document.children ?? (document.content === undefined ? [] : [document.content]);
}

function appendNode(nodes: SsmlNode[], node: SsmlNode): void {
  if (typeof node === "string") {
    const lastNode = nodes[nodes.length - 1];
    if (typeof lastNode === "string") {
      nodes[nodes.length - 1] = lastNode + node;
    } else if (node !== "") {
      nodes.push(node);
    }
    return;
  }

  nodes.push(node);
}

function clearNodes(nodes: SsmlNode[]): SsmlNode[] {
  const clearedNodes: SsmlNode[] = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      appendNode(clearedNodes, node);
      continue;
    }

    if (node.type === "text") {
      appendNode(clearedNodes, node.value);
      continue;
    }

    const children = clearNodes(node.children ?? []);
    if (node.type === "voice") {
      appendNode(clearedNodes, { ...node, children });
      continue;
    }

    for (const child of children) {
      appendNode(clearedNodes, child);
    }
  }

  return clearedNodes;
}

export function clearSsmlDocument(document: SsmlDocument): SsmlDocument {
  const nextDocument: SsmlDocument = {
    ...document,
    children: clearNodes(getDocumentChildren(document)),
  };
  if (nextDocument.content !== undefined) {
    delete nextDocument.content;
  }
  return nextDocument;
}
