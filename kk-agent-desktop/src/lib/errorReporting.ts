import { createLogger } from "./logger";

const logger = createLogger("app-error");

export type ErrorNotice = {
  id: number;
  title: string;
  message: string;
  occurrences: number;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let notices: ErrorNotice[] = [];
let nextId = 1;

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "An unexpected error occurred.";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function reportError(title: string, error: unknown): ErrorNotice {
  const normalizedTitle = title.trim() || "Something went wrong";
  const message = getErrorMessage(error);
  logger.error(normalizedTitle, error);

  const previous = notices.at(-1);
  if (previous && previous.title === normalizedTitle && previous.message === message) {
    const updated = { ...previous, occurrences: previous.occurrences + 1 };
    notices = [...notices.slice(0, -1), updated];
    emitChange();
    return updated;
  }

  const notice: ErrorNotice = {
    id: nextId++,
    title: normalizedTitle,
    message,
    occurrences: 1,
  };
  notices = [...notices, notice];
  emitChange();
  return notice;
}

export function dismissError(id: number): void {
  const next = notices.filter((notice) => notice.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emitChange();
}

export function getErrorNotices(): ErrorNotice[] {
  return notices;
}

export function subscribeToErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
