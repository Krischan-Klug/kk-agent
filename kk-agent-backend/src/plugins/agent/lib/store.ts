import { loadState, saveState } from "../../lib/state.js";
import type { AgentDefinition } from "../types.js";
import type { PersistedAgentsState, PersistedAgentDefinition } from "./persisted-types.js";
import {
  buildDefaultModes,
  compactEffectiveMode,
  expandPersistedMode,
  normalizeModeDefinitions,
  resolveDefaultModeId,
} from "./mode-config.js";
import { isModeBehavior } from "./modes.js";
import { getBundledAgents } from "./defaults.js";

const STATE_FILE = "agents.json";
const AGENT_SCHEMA_VERSION = 5;

let cache: PersistedAgentDefinition[] | null = null;

function expandPersistedAgent(agent: PersistedAgentDefinition): AgentDefinition {
  return {
    ...agent,
    modes: agent.modes.map(expandPersistedMode),
  };
}

function compactEffectiveAgent(agent: AgentDefinition): PersistedAgentDefinition {
  return {
    ...agent,
    modes: agent.modes.map(compactEffectiveMode),
  };
}

function normalizePersistedAgent(agent: PersistedAgentDefinition): PersistedAgentDefinition {
  const supportedModes = agent.modes
    .filter((mode) => isModeBehavior(mode.behavior))
    .map(expandPersistedMode);
  const modes = supportedModes.some((mode) => mode.enabled)
    ? normalizeModeDefinitions(supportedModes)
    : buildDefaultModes();
  return compactEffectiveAgent({
    ...agent,
    defaultModeId: resolveDefaultModeId(agent.defaultModeId, modes),
    modes,
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
    modes: update.modes ?? currentEffective.modes,
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
