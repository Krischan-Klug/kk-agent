import { WebToolError } from "./errors.js";

interface InflightEntry<T> {
  controller: AbortController;
  consumers: number;
  settled: boolean;
  promise: Promise<T>;
}

function waitForConsumer<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new WebToolError("Search was aborted.", "aborted"));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(new WebToolError("Search was aborted.", "aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

export class AbortableInflightMap<T> {
  private readonly entries = new Map<string, InflightEntry<T>>();

  async run(
    key: string,
    work: (signal: AbortSignal) => Promise<T>,
    consumerSignal?: AbortSignal,
  ): Promise<{ value: T; reused: boolean }> {
    let entry = this.entries.get(key);
    const reused = entry !== undefined;
    if (!entry) {
      const controller = new AbortController();
      entry = {
        controller,
        consumers: 0,
        settled: false,
        promise: work(controller.signal),
      };
      this.entries.set(key, entry);
      const created = entry;
      void created.promise.then(
        () => this.finish(key, created),
        () => this.finish(key, created),
      );
    }

    entry.consumers += 1;
    try {
      return { value: await waitForConsumer(entry.promise, consumerSignal), reused };
    } finally {
      entry.consumers -= 1;
      if (entry.consumers === 0 && !entry.settled) entry.controller.abort();
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }

  private finish(key: string, entry: InflightEntry<T>): void {
    entry.settled = true;
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }
}
