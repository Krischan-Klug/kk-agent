import { agent as agentApi, provider as providerApi, session as sessionApi } from "@/lib/api";
import type { AgentDefinition, ProviderConfig, SessionState } from "@/types/api";
import { emitAppEvent, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { setActiveSessionId } from "@/lib/sessionState";

type SessionCreateAgent = Pick<AgentDefinition, "id" | "name" | "defaultProviderId">;
type SessionCreateProvider = Pick<ProviderConfig, "id" | "name">;

export type SessionCreationContext = {
  agentId: string;
  agent: SessionCreateAgent;
  providers: SessionCreateProvider[];
  selectedProviderId?: string;
  requiresProviderSelection: boolean;
};

export function resolveDefaultSessionAgentId(agents: Pick<AgentDefinition, "id">[], fallbackAgentId?: string): string {
  const resolved = fallbackAgentId ?? agents[0]?.id;
  if (!resolved) {
    throw new Error("No agent available for session creation.");
  }
  return resolved;
}

async function loadAgentsWithNames(agents: Array<Pick<AgentDefinition, "id" | "name" | "defaultProviderId">>) {
  if (agents.length > 0 && agents.every((agent) => typeof agent.name === "string" && agent.name.trim().length > 0)) {
    return agents;
  }
  return agentApi.list();
}

async function resolveDefaultSessionAgentForCreate(
  agents: Array<Pick<AgentDefinition, "id" | "name" | "defaultProviderId">>,
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

function resolveDefaultSessionProviderId(
  providers: SessionCreateProvider[],
  agent?: Pick<AgentDefinition, "defaultProviderId">,
  providerIdOverride?: string,
): string | undefined {
  if (providerIdOverride) return providerIdOverride;
  if (agent?.defaultProviderId) return agent.defaultProviderId;
  return providers.length === 1 ? providers[0]?.id : undefined;
}

export async function resolveSessionCreationContext(
  agents: Array<Pick<AgentDefinition, "id" | "name" | "defaultProviderId">>,
  fallbackAgentId?: string,
  providerIdOverride?: string,
): Promise<SessionCreationContext> {
  const [selectedAgent, providers] = await Promise.all([
    resolveDefaultSessionAgentForCreate(agents, fallbackAgentId),
    providerApi.listProviders(),
  ]);
  const selectedProviderId = resolveDefaultSessionProviderId(providers, selectedAgent, providerIdOverride);

  return {
    agentId: selectedAgent.id,
    agent: selectedAgent,
    providers,
    selectedProviderId,
    requiresProviderSelection: !selectedProviderId && providers.length > 1,
  };
}

export async function createAndActivateSession(
  agents: Array<Pick<AgentDefinition, "id" | "name" | "defaultProviderId">>,
  fallbackAgentId?: string,
  providerIdOverride?: string,
): Promise<SessionState> {
  const context = await resolveSessionCreationContext(agents, fallbackAgentId, providerIdOverride);
  const providerId = context.selectedProviderId;
  if (!providerId && context.providers.length > 1) {
    throw new Error("Provider selection required for session creation.");
  }

  const session = await sessionApi.create({
    agentId: context.agentId,
    providerId,
  });
  setActiveSessionId(session.id);
  emitAppEvent(SESSION_CHANGED_EVENT);
  return session;
}
