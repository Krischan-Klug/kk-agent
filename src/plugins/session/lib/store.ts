import { v4 as uuidv4 } from "uuid";
import type { SessionRecord, SessionState } from "../types.js";

const sessions = new Map<string, SessionRecord>();

export function createSession(data: {
  agentId: string;
  providerId: string;
  model: string;
  activeMode: SessionState["activeMode"];
  activeToolIds: string[];
  activeMcpIds: string[];
  reasoningEffort?: SessionState["reasoningEffort"];
  temperature?: number;
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
    reasoningEffort: data.reasoningEffort,
    temperature: data.temperature,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, update: Partial<SessionRecord>): SessionRecord {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  Object.assign(session, update, { updatedAt: new Date().toISOString() });
  return session;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function listSessions(): SessionRecord[] {
  return [...sessions.values()];
}
