import { loadState, saveState } from "../../lib/state.js";
import type { AgentDefinition } from "../types.js";
import type { PersistedAgentsState, PersistedAgentDefinition } from "./persisted-types.js";
import { compactAgentConfig, expandAgentConfig, normalizeAgentConfig } from "./agent-config.js";
import { getBundledAgents } from "./defaults.js";

const STATE_FILE = "agents.json";
const AGENT_SCHEMA_VERSION = 6;

let cache: PersistedAgentDefinition[] | null = null;

function expandPersistedAgent(agent: PersistedAgentDefinition): AgentDefinition {
  const { configOverrides, ...definition } = agent;
  return {
    ...definition,
    ...expandAgentConfig(configOverrides),
  };
}

function compactEffectiveAgent(agent: AgentDefinition): PersistedAgentDefinition {
  const {
    color,
    promptSections,
    toolIds,
    mcpIds,
    skillIds,
    toolAccessScopes,
    toolInstructions,
    mcpInstructions,
    allowedToolNames,
    ...definition
  } = agent;
  return {
    ...definition,
    configOverrides: compactAgentConfig({
      color,
      promptSections,
      toolIds,
      mcpIds,
      skillIds,
      toolAccessScopes,
      toolInstructions,
      mcpInstructions,
      allowedToolNames,
    }),
  };
}

function normalizePersistedAgent(agent: PersistedAgentDefinition): PersistedAgentDefinition {
  return compactEffectiveAgent({
    ...expandPersistedAgent(agent),
    ...normalizeAgentConfig(agent.configOverrides),
  });
}

export async function initStore(): Promise<void> {
  const stored = await loadState<unknown>(STATE_FILE, null);
  const state = stored
    && typeof stored === "object"
    && (stored as Partial<PersistedAgentsState>).schemaVersion === AGENT_SCHEMA_VERSION
    && Array.isArray((stored as Partial<PersistedAgentsState>).agents)
    ? stored as PersistedAgentsState
    : {
        schemaVersion: AGENT_SCHEMA_VERSION,
        agents: getBundledAgents().map(compactEffectiveAgent),
      };

  const agents = state.agents.length > 0
    ? state.agents.map(normalizePersistedAgent)
    : getBundledAgents().map(compactEffectiveAgent);
  cache = agents;
  await saveState(STATE_FILE, { schemaVersion: AGENT_SCHEMA_VERSION, agents });
}

function getCache(): PersistedAgentDefinition[] {
  if (!cache) throw new Error("Agent store not initialised");
  return cache;
}

async function persist(): Promise<void> {
  await saveState(STATE_FILE, { schemaVersion: AGENT_SCHEMA_VERSION, agents: getCache() });
}

export function listAgents(): AgentDefinition[] {
  return getCache().map(expandPersistedAgent);
}

export function getAgent(id: string): AgentDefinition | undefined {
  const persisted = getCache().find((a) => a.id === id);
  return persisted ? expandPersistedAgent(persisted) : undefined;
}

export async function createAgent(agent: AgentDefinition): Promise<AgentDefinition> {
  const agents = getCache();
  if (agents.some((a) => a.id === agent.id)) {
    throw new Error(`Agent "${agent.id}" already exists`);
  }
  const persisted = compactEffectiveAgent(agent);
  agents.push(persisted);
  await persist();
  return expandPersistedAgent(persisted);
}

export async function updateAgent(id: string, update: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const agents = getCache();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Agent "${id}" not found`);

  const currentPersisted = agents[idx];
  const currentEffective = expandPersistedAgent(currentPersisted);
  const nextEffective: AgentDefinition = {
    ...currentEffective,
    ...update,
    updatedAt: new Date().toISOString(),
  };

  const nextPersisted = compactEffectiveAgent(nextEffective);
  agents[idx] = nextPersisted;
  await persist();
  return expandPersistedAgent(nextPersisted);
}

export async function deleteAgent(id: string): Promise<boolean> {
  const agents = getCache();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  agents.splice(idx, 1);
  await persist();
  return true;
}
