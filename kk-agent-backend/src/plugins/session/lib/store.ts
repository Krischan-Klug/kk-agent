import type { SessionRecord, SessionState } from "../types.js";
import {
  ensureSessionsRoot,
  loadSessionData,
  saveSessionData,
  deleteSessionData,
  listPersistedSessionIds,
} from "../../lib/state.js";
import { createLogger } from "../../../lib/logger.js";
import { getErrorMessage } from "../../../lib/error.js";
import { NotFoundError } from "../../../lib/errors.js";
import { ensureTasksLoaded } from "../../tools/lib/task-state.js";
import { ensureSessionFactsLoaded } from "../../tools/lib/memory-state.js";

const logger = createLogger("session/store");

const SESSION_FILE = "session.json";
const MESSAGES_FILE = "messages.json";

const sessions = new Map<string, SessionRecord>();

/* Persistence helpers */

type PersistedSessionMeta = Omit<SessionRecord, "messages">;

async function persistSession(session: SessionRecord): Promise<void> {
  const { messages, ...meta } = session;
  await Promise.all([
    saveSessionData(session.id, SESSION_FILE, meta),
    saveSessionData(session.id, MESSAGES_FILE, messages),
  ]);
}

/* Init (load from disk) */

export async function initStore(): Promise<void> {
  await ensureSessionsRoot();
  const ids = await listPersistedSessionIds();

  for (const id of ids) {
    try {
      const meta = await loadSessionData<PersistedSessionMeta | null>(id, SESSION_FILE, null);
      if (!meta || !meta.id) continue;

      const messages = await loadSessionData<SessionRecord["messages"]>(id, MESSAGES_FILE, []);

      const session: SessionRecord = { ...meta, messages };
      sessions.set(id, session);

      // Hydrate per-session satellite state.
      await ensureTasksLoaded(id);
      await ensureSessionFactsLoaded(id);
    } catch (err) {
      logger.warn(`Failed to load session "${id}":`, getErrorMessage(err));
    }
  }

  logger.info(`Loaded ${sessions.size} session(s) from disk.`);
}

/* CRUD */

export async function createSession(data: {
  agentId: string;
  providerId: string;
  model: string;
  activeModeId: SessionState["activeModeId"];
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: SessionState["llmRequestConfig"];
}): Promise<SessionRecord> {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    name: "",
    providerId: data.providerId,
    model: data.model,
    agentId: data.agentId,
    activeModeId: data.activeModeId,
    activeToolIds: data.activeToolIds,
    activeMcpIds: data.activeMcpIds,
    activeSkillIds: data.activeSkillIds,
    llmRequestConfig: data.llmRequestConfig,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  await persistSession(session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export async function updateSession(id: string, update: Partial<SessionRecord>): Promise<SessionRecord> {
  const session = sessions.get(id);
  if (!session) throw new NotFoundError("Session", id);
  Object.assign(session, update, { updatedAt: new Date().toISOString() });
  await persistSession(session);
  return session;
}

export async function deleteSession(id: string): Promise<boolean> {
  const deleted = sessions.delete(id);
  if (deleted) {
    await deleteSessionData(id);
  }
  return deleted;
}

export function listSessions(): SessionRecord[] {
  return [...sessions.values()];
}
