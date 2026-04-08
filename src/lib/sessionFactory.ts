import { agent as agentApi, session as sessionApi } from "@/lib/api";
import type { AgentDefinition, SessionState } from "@/types/api";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { setActiveSessionId } from "@/lib/sessionState";

export function resolveDefaultSessionAgentId(agents: Pick<AgentDefinition, "id">[], fallbackAgentId?: string): string {
  const resolved = fallbackAgentId ?? agents[0]?.id;
  if (!resolved) {
    throw new Error("No agent available for session creation.");
  }
  return resolved;
}

async function resolveDefaultSessionAgentIdForCreate(
  agents: Pick<AgentDefinition, "id">[],
  fallbackAgentId?: string,
): Promise<string> {
  if (fallbackAgentId) return fallbackAgentId;
  if (agents.length > 0) return agents[0].id;

  const loadedAgents = await agentApi.list();
  return resolveDefaultSessionAgentId(loadedAgents);
}

export async function createAndActivateSession(
  agents: Pick<AgentDefinition, "id">[],
  fallbackAgentId?: string,
): Promise<SessionState> {
  const session = await sessionApi.create({
    agentId: await resolveDefaultSessionAgentIdForCreate(agents, fallbackAgentId),
  });
  setActiveSessionId(session.id);
  emitAppEvent(SESSION_CHANGED_EVENT);
  return session;
}
