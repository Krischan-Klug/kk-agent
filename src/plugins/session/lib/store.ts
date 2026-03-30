import { v4 as uuidv4 } from "uuid";
import type { SessionState } from "../types.js";

const sessions = new Map<string, SessionState>();

export function createSession(data: {
  agentId: string;
  model: string;
  activeMcpIds: string[];
  systemPrompt: string;
  reasoningEffort?: SessionState["reasoningEffort"];
  temperature?: number;
}): SessionState {
  const now = new Date().toISOString();
  const session: SessionState = {
    id: uuidv4(),
    name: "",
    model: data.model,
    agentId: data.agentId,
    activeMcpIds: data.activeMcpIds,
    systemPrompt: data.systemPrompt,
    reasoningEffort: data.reasoningEffort,
    temperature: data.temperature,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, update: Partial<SessionState>): SessionState {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  Object.assign(session, update, { updatedAt: new Date().toISOString() });
  return session;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function listSessions(): SessionState[] {
  return [...sessions.values()];
}
