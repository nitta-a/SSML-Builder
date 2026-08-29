import { SynthesisTimeoutError } from "./errors.ts";

/** Coordinates one absolute deadline across validation, synthesis, retries, and merging. */
export class DeadlineController {
  readonly deadlineAtMs: number | undefined;
  readonly signal: AbortSignal;
  readonly #controller = new AbortController();
  readonly #parent?: AbortSignal;
  readonly #onParentAbort: () => void;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #timedOut = false;

  constructor(totalJobMs: number | undefined, parent?: AbortSignal) {
    this.#parent = parent;
    this.#onParentAbort = () => this.#controller.abort();
    this.deadlineAtMs = totalJobMs !== undefined && totalJobMs > 0 ? Date.now() + totalJobMs : undefined;
    this.signal = this.deadlineAtMs === undefined && parent ? parent : this.#controller.signal;
    if (parent?.aborted) this.#controller.abort();
    parent?.addEventListener("abort", this.#onParentAbort, { once: true });
    if (this.deadlineAtMs !== undefined) {
      this.#timer = setTimeout(
        () => {
          this.#timedOut = true;
          this.#controller.abort();
        },
        Math.max(0, this.deadlineAtMs - Date.now()),
      );
    }
  }

  get timedOut(): boolean {
    return this.#timedOut || (this.deadlineAtMs !== undefined && this.remainingMs <= 0);
  }

  get remainingMs(): number {
    return this.deadlineAtMs === undefined ? Number.POSITIVE_INFINITY : Math.max(0, this.deadlineAtMs - Date.now());
  }

  throwIfExpired(): void {
    if (this.timedOut) throw new SynthesisTimeoutError("Speech synthesis exceeded the total job deadline.");
    if (this.signal.aborted) throw new Error("Speech synthesis was cancelled.");
  }

  abort(): void {
    this.#controller.abort();
  }

  dispose(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#parent?.removeEventListener("abort", this.#onParentAbort);
  }
}
