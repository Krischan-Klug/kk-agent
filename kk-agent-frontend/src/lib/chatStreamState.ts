import type { AgentLoopState } from "@/types/api";
import type { PendingPrompt, StreamingTurnState, TokenDisplayStats } from "@/components/chat/types";

type ChatStreamSnapshot = {
  sending: boolean;
  streaming: boolean;
  streamTurn: StreamingTurnState | null;
  streamSystemNotices: string[];
  loopState: AgentLoopState | null;
  tokenStats: TokenDisplayStats | null;
  pendingPrompt: PendingPrompt | null;
  customAnswer: string;
};

const EMPTY_STREAM_SNAPSHOT: ChatStreamSnapshot = {
  sending: false,
  streaming: false,
  streamTurn: null,
  streamSystemNotices: [],
  loopState: null,
  tokenStats: null,
  pendingPrompt: null,
  customAnswer: "",
};

const sessionSnapshots = new Map<string, ChatStreamSnapshot>();
const sessionListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<() => void>();

function notifySession(sessionId: string): void {
  sessionListeners.get(sessionId)?.forEach((listener) => listener());
  globalListeners.forEach((listener) => listener());
}

function getEmptyChatStreamSnapshot(): ChatStreamSnapshot {
  return {
    ...EMPTY_STREAM_SNAPSHOT,
    streamSystemNotices: [],
  };
}

export function getChatStreamSnapshot(sessionId?: string | null): ChatStreamSnapshot {
  if (!sessionId) return getEmptyChatStreamSnapshot();
  const snapshot = sessionSnapshots.get(sessionId);
  if (!snapshot) return getEmptyChatStreamSnapshot();
  return snapshot;
}

export function subscribeChatStreamSnapshot(sessionId: string, listener: () => void): () => void {
  const listeners = sessionListeners.get(sessionId) ?? new Set<() => void>();
  listeners.add(listener);
  sessionListeners.set(sessionId, listeners);
  return () => {
    const current = sessionListeners.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      sessionListeners.delete(sessionId);
    }
  };
}

export function subscribeChatStreamStore(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function updateChatStreamSnapshot(
  sessionId: string,
  updater: (previous: ChatStreamSnapshot) => ChatStreamSnapshot,
): void {
  const previous = sessionSnapshots.get(sessionId) ?? getEmptyChatStreamSnapshot();
  const next = updater(previous);
  sessionSnapshots.set(sessionId, next);
  notifySession(sessionId);
}

export function resetChatStreamSnapshot(sessionId: string): void {
  sessionSnapshots.delete(sessionId);
  notifySession(sessionId);
}

export function getRunningChatStreamSessionIds(): string[] {
  return [...sessionSnapshots.entries()]
    .filter(([, snapshot]) => snapshot.sending || snapshot.streaming || snapshot.loopState?.status === "running")
    .map(([sessionId]) => sessionId);
}
