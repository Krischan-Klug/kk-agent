import { v4 as uuidv4 } from "uuid";
import type { SessionRecord, SessionState } from "../types.js";
import {
  ensureSessionsRoot,
  loadSessionData,
  saveSessionData,
  deleteSessionData,
  listPersistedSessionIds,
} from "../../lib/state.js";

const SESSION_FILE = "session.json";
const MESSAGES_FILE = "messages.json";

const sessions = new Map<string, SessionRecord>();

/* ── Persistence helpers ── */

type PersistedSessionMeta = Omit<SessionRecord, "messages">;

async function persistSession(session: SessionRecord): Promise<void> {
  const { messages, ...meta } = session;
  await Promise.all([
    saveSessionData(session.id, SESSION_FILE, meta),
    saveSessionData(session.id, MESSAGES_FILE, messages),
  ]);
}

/* ── Init (load from disk) ── */

export async function initStore(): Promise<void> {
  await ensureSessionsRoot();
  const ids = await listPersistedSessionIds();

  // Dynamic import to avoid circular dependency at module level.
  // session depends on tools (listed in deps), so tools plugin is already initialized.
  const { ensureTasksLoaded } = await import("../../tools/lib/task-state.js");
  const { ensureSessionFactsLoaded } = await import("../../tools/lib/memory-state.js");

  for (const id of ids) {
    try {
      const meta = await loadSessionData<PersistedSessionMeta | null>(id, SESSION_FILE, null);
      if (!meta || !meta.id) continue;

      const messages = await loadSessionData<SessionRecord["messages"]>(id, MESSAGES_FILE, []);

      const session: SessionRecord = { ...meta, messages };
      sessions.set(id, session);

      // Hydrate per-session satellite state
      await ensureTasksLoaded(id);
      await ensureSessionFactsLoaded(id);
    } catch (err) {
      console.warn(`[session/store] Failed to load session "${id}":`, (err as Error).message);
    }
  }

  console.log(`[session/store] Loaded ${sessions.size} session(s) from disk.`);
}

/* ── CRUD ── */

export function createSession(data: {
  agentId: string;
  providerId: string;
  model: string;
  activeMode: SessionState["activeMode"];
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: SessionState["llmRequestConfig"];
}): SessionRecord {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: uuidv4(),
    name: "",
    providerId: data.providerId,
    model: data.model,
    agentId: data.agentId,
    activeMode: data.activeMode,
    activeToolIds: data.activeToolIds,
    activeMcpIds: data.activeMcpIds,
    activeSkillIds: data.activeSkillIds,
    llmRequestConfig: data.llmRequestConfig,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  void persistSession(session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, update: Partial<SessionRecord>): SessionRecord {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  Object.assign(session, update, { updatedAt: new Date().toISOString() });
  void persistSession(session);
  return session;
}

export function deleteSession(id: string): boolean {
  const deleted = sessions.delete(id);
  if (deleted) {
    void deleteSessionData(id);
  }
  return deleted;
}

export function listSessions(): SessionRecord[] {
  return [...sessions.values()];
}
