import { agent as agentApi, session as sessionApi } from "@/lib/api";
import type { AgentDefinition, SessionState } from "kk-agent-contract";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { setActiveSessionId } from "@/lib/sessionState";

type SessionCreateAgent = Pick<AgentDefinition, "id" | "name">;

export function resolveDefaultSessionAgentId(agents: Pick<AgentDefinition, "id">[], fallbackAgentId?: string): string {
  const resolved = fallbackAgentId ?? agents[0]?.id;
  if (!resolved) {
    throw new Error("No agent available for session creation.");
  }
  return resolved;
}

async function loadAgentsWithNames(agents: Array<Pick<AgentDefinition, "id" | "name">>) {
  if (agents.length > 0 && agents.every((agent) => typeof agent.name === "string" && agent.name.trim().length > 0)) {
    return agents;
  }
  return agentApi.list();
}

async function resolveDefaultSessionAgentForCreate(
  agents: Array<Pick<AgentDefinition, "id" | "name">>,
  fallbackAgentId?: string,
): Promise<SessionCreateAgent> {
  const loadedAgents = await loadAgentsWithNames(agents);
  const agentId = resolveDefaultSessionAgentId(loadedAgents, fallbackAgentId);
  const selected = loadedAgents.find((agent) => agent.id === agentId);
  if (!selected) {
    throw new Error(`Agent not found for session creation: ${agentId}`);
  }
  return selected;
}

export async function createAndActivateSession(
  agents: Array<Pick<AgentDefinition, "id" | "name">>,
  fallbackAgentId?: string,
): Promise<SessionState> {
  const selectedAgent = await resolveDefaultSessionAgentForCreate(agents, fallbackAgentId);

  const session = await sessionApi.create({
    agentId: selectedAgent.id,
  });
  setActiveSessionId(session.id);
  emitAppEvent(SESSION_CHANGED_EVENT);
  return session;
}
