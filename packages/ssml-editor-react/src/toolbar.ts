export const ADVANCED_TOOLBAR_IDS: ReadonlySet<string> = new Set([
  "lang",
  "mstts:silence",
  "mstts:audioduration",
  "format",
  "decorations",
  "clearAll",
]);

export interface EditorHistoryState {
  ready: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

interface UndoableEditorModel {
  getAlternativeVersionId(): number;
}

export class ToolbarDocumentHistory {
  private model: UndoableEditorModel | null = null;
  private checkpoints = new Map<number, SsmlDocument>();

  remember(model: UndoableEditorModel, document: SsmlDocument): void {
    if (model !== this.model) this.clear();
    this.model = model;
    this.checkpoints.set(model.getAlternativeVersionId(), document);
  }

  find(model: UndoableEditorModel): SsmlDocument | undefined {
    if (model !== this.model) this.clear();
    this.model = model;
    return this.checkpoints.get(model.getAlternativeVersionId());
  }

  clear(): void {
    this.model = null;
    this.checkpoints.clear();
  }
}

export interface ToolbarButtonGroup {
  id: string;
  label?: string;
  buttonIds: string[];
}

export function groupToolbarButtons(
  buttonIds: readonly string[],
  groupByButtonId: ReadonlyMap<string, string>,
  groupLabels: ReadonlyMap<string, string>,
): ToolbarButtonGroup[] {
  const groups: ToolbarButtonGroup[] = [];
  for (const buttonId of buttonIds) {
    const id = groupByButtonId.get(buttonId) ?? "__ssml-editor-ungrouped__";
    const previous = groups[groups.length - 1];
    if (previous?.id === id) {
      previous.buttonIds.push(buttonId);
    } else {
      groups.push({ id, label: groupLabels.get(id), buttonIds: [buttonId] });
    }
  }
  return groups;
}

function getEnabledButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(
    (button) => !button.closest("[hidden]"),
  );
}

export function syncToolbarTabStops(toolbar: HTMLElement, preferred?: HTMLButtonElement): void {
  const buttons = getEnabledButtons(toolbar);
  const focused = buttons.find((button) => button === toolbar.ownerDocument.activeElement);
  const current = preferred ?? focused ?? buttons.find((button) => button.tabIndex === 0) ?? buttons[0];
  for (const button of toolbar.querySelectorAll<HTMLButtonElement>("button")) {
    button.tabIndex = button === current && !button.disabled ? 0 : -1;
  }
}

export function handleToolbarKeyDown(event: KeyboardEvent, toolbar: HTMLElement): void {
  if (event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLButtonElement)) return;
  const buttons = getEnabledButtons(toolbar);
  const index = buttons.indexOf(event.target);
  if (index === -1) return;

  let nextIndex: number;
  if (event.key === "ArrowRight") {
    nextIndex = (index + 1) % buttons.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (index + buttons.length - 1) % buttons.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = buttons.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  syncToolbarTabStops(toolbar, buttons[nextIndex]);
  buttons[nextIndex].focus();
}

export function focusMenuItem(menu: HTMLElement, edge: "first" | "last" = "first"): void {
  const items = getEnabledButtons(menu);
  const item = edge === "last" ? items[items.length - 1] : items[0];
  (item ?? menu).focus();
}

export function handleMenuKeyDown(
  event: KeyboardEvent,
  menu: HTMLElement,
  close: (restoreFocus: boolean) => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close(true);
    return;
  }
  const items = getEnabledButtons(menu);
  if (items.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
  const focused = items.find((item) => item === menu.ownerDocument.activeElement);
  const index = focused ? items.indexOf(focused) : -1;
  let next: HTMLButtonElement | undefined;
  if (event.key === "ArrowDown") {
    next = items[(index + 1) % items.length];
  } else if (event.key === "ArrowUp") {
    next = items[(index < 0 ? items.length - 1 : index + items.length - 1) % items.length];
  } else if (event.key === "Home") {
    next = items[0];
  } else if (event.key === "End") {
    next = items[items.length - 1];
  } else if (event.key.length === 1 && event.key !== " ") {
    const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
    next = ordered.find((item) =>
      (item.getAttribute("aria-label") ?? item.textContent ?? "")
        .toLocaleLowerCase()
        .startsWith(event.key.toLocaleLowerCase()),
    );
  }
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

export function getPopoverPosition(
  anchor: Pick<DOMRect, "top" | "bottom" | "left">,
  menu: HTMLElement | null,
): { top: number; left: number } {
  const margin = 8;
  const gap = 6;
  const height = menu?.offsetHeight ?? 0;
  const width = menu?.offsetWidth ?? 0;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;
  const preferredTop = below + height > window.innerHeight - margin && above >= margin ? above : below;
  return {
    top: Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin)),
    left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
  };
}
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
