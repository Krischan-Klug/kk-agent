import { loadState, saveState } from "../../lib/state.js";
import type { AgentDefinition } from "../types.js";
import { getBundledAgents } from "./defaults.js";

const STATE_FILE = "agents.json";

interface AgentsState {
  agents: AgentDefinition[];
}

let cache: AgentDefinition[] | null = null;

export async function initStore(): Promise<void> {
  const state = await loadState<AgentsState>(STATE_FILE, { agents: [] });

  if (state.agents.length === 0) {
    state.agents.push(...getBundledAgents());
    await saveState(STATE_FILE, state);
  }

  cache = state.agents;
}

function getCache(): AgentDefinition[] {
  if (!cache) throw new Error("Agent store not initialised");
  return cache;
}

async function persist(): Promise<void> {
  await saveState(STATE_FILE, { agents: getCache() });
}

export function listAgents(): AgentDefinition[] {
  return getCache();
}

export function getAgent(id: string): AgentDefinition | undefined {
  return getCache().find((a) => a.id === id);
}

export async function createAgent(agent: AgentDefinition): Promise<AgentDefinition> {
  const agents = getCache();
  if (agents.some((a) => a.id === agent.id)) {
    throw new Error(`Agent "${agent.id}" already exists`);
  }
  agents.push(agent);
  await persist();
  return agent;
}

export async function updateAgent(id: string, update: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const agents = getCache();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Agent "${id}" not found`);
  Object.assign(agents[idx], update, { updatedAt: new Date().toISOString() });
  await persist();
  return agents[idx];
}

export async function deleteAgent(id: string): Promise<boolean> {
  const agents = getCache();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  agents.splice(idx, 1);
  await persist();
  return true;
}
