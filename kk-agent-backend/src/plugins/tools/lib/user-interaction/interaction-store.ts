import type { ToolCallResult } from "../../types.js";

const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

export interface UserPromptPayload {
  purpose: "question" | "approval";
  promptId: string;
  question: string;
  choices: { key: string; label: string }[];
}

interface PendingPrompt {
  resolve: (result: ToolCallResult) => void;
  reject: (err: Error) => void;
}

interface SessionEntry {
  emit: (payload: UserPromptPayload) => void;
  pending: Map<string, PendingPrompt>;
}

/* Session-scoped store */

const store = new Map<string, SessionEntry>();

export function registerSession(
  sessionId: string,
  emit: (payload: UserPromptPayload) => void,
): void {
  store.set(sessionId, { emit, pending: new Map() });
}

export function unregisterSession(sessionId: string): void {
  const entry = store.get(sessionId);
  if (!entry) return;
  cancelPendingPrompts(sessionId, "Session ended while waiting for user response");
  store.delete(sessionId);
}

export function cancelPendingPrompts(sessionId: string, reason: string): void {
  const entry = store.get(sessionId);
  if (!entry) return;
  for (const pending of entry.pending.values()) pending.reject(new Error(reason));
  entry.pending.clear();
}

export function emitPrompt(sessionId: string, payload: UserPromptPayload): void {
  const entry = store.get(sessionId);
  if (!entry) throw new Error(`No active session "${sessionId}" for user prompt`);
  entry.emit(payload);
}

export function waitForResponse(sessionId: string, promptId: string): Promise<ToolCallResult> {
  const entry = store.get(sessionId);
  if (!entry) throw new Error(`No active session "${sessionId}"`);

  return new Promise<ToolCallResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      entry.pending.delete(promptId);
      resolve({ content: "User did not respond within the time limit.", isError: true });
    }, PROMPT_TIMEOUT_MS);

    entry.pending.set(promptId, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

export function resolvePrompt(sessionId: string, promptId: string, selectedKey: string): boolean {
  const entry = store.get(sessionId);
  if (!entry) return false;
  const pending = entry.pending.get(promptId);
  if (!pending) return false;
  pending.resolve({ content: JSON.stringify({ selectedKey }), isError: false });
  entry.pending.delete(promptId);
  return true;
}
