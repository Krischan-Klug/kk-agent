import type { AgentDefinition, CreateAgentBody, UpdateAgentBody, AgentLoopState } from "./types.js";
import * as store from "./lib/store.js";

export async function initAgentService(): Promise<void> {
  await store.initStore();
}

export function listAgents(): AgentDefinition[] {
  return store.listAgents();
}

export function getAgent(id: string): AgentDefinition {
  const agent = store.getAgent(id);
  if (!agent) throw new Error(`Agent "${id}" not found`);
  return agent;
}

export async function createAgent(body: CreateAgentBody): Promise<AgentDefinition> {
  const id = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const now = new Date().toISOString();

  const agent: AgentDefinition = {
    id,
    name: body.name,
    description: body.description ?? "",
    loopStrategy: body.loopStrategy,
    promptTemplates: body.promptTemplates,
    mcpIds: body.mcpIds ?? [],
    mcpInstructions: body.mcpInstructions ?? {},
    variables: body.variables ?? {},
    defaultModel: body.defaultModel,
    reasoningEffort: body.reasoningEffort,
    compactionPrompt: body.compactionPrompt,
    createdAt: now,
    updatedAt: now,
  };

  return store.createAgent(agent);
}

export async function updateAgent(id: string, body: UpdateAgentBody): Promise<AgentDefinition> {
  const patch: Partial<AgentDefinition> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.loopStrategy !== undefined) patch.loopStrategy = body.loopStrategy;
  if (body.promptTemplates !== undefined) patch.promptTemplates = body.promptTemplates;
  if (body.mcpIds !== undefined) patch.mcpIds = body.mcpIds;
  if (body.mcpInstructions !== undefined) patch.mcpInstructions = body.mcpInstructions;
  if (body.variables !== undefined) patch.variables = body.variables;
  if (body.defaultModel !== undefined) patch.defaultModel = body.defaultModel;
  if (body.reasoningEffort !== undefined) patch.reasoningEffort = body.reasoningEffort;
  if (body.compactionPrompt !== undefined) patch.compactionPrompt = body.compactionPrompt;
  return store.updateAgent(id, patch);
}

export async function deleteAgent(id: string): Promise<void> {
  const removed = await store.deleteAgent(id);
  if (!removed) throw new Error(`Agent "${id}" not found`);
}

export async function removeMcpFromAgents(mcpId: string): Promise<void> {
  const updates = listAgents()
    .filter((agent) => agent.mcpIds.includes(mcpId) || agent.mcpInstructions[mcpId] !== undefined)
    .map(async (agent) => {
      const nextMcpIds = agent.mcpIds.filter((id) => id !== mcpId);
      const nextInstructions = { ...agent.mcpInstructions };
      delete nextInstructions[mcpId];
      await store.updateAgent(agent.id, {
        mcpIds: nextMcpIds,
        mcpInstructions: nextInstructions,
      });
    });

  await Promise.all(updates);
}

/* ── Loop State (in-memory, runtime only) ── */

const loopStates = new Map<string, AgentLoopState>();
const loopStateListeners = new Map<string, Set<(state: AgentLoopState) => void>>();

export function getLoopState(sessionId: string): AgentLoopState | undefined {
  return loopStates.get(sessionId);
}

export function setLoopState(sessionId: string, state: AgentLoopState): void {
  loopStates.set(sessionId, state);
  const listeners = loopStateListeners.get(sessionId);
  if (listeners) {
    for (const cb of listeners) cb(state);
  }
}

export function clearLoopState(sessionId: string): void {
  loopStates.delete(sessionId);
  loopStateListeners.delete(sessionId);
}

export function subscribeLoopState(sessionId: string, cb: (state: AgentLoopState) => void): () => void {
  if (!loopStateListeners.has(sessionId)) {
    loopStateListeners.set(sessionId, new Set());
  }
  loopStateListeners.get(sessionId)!.add(cb);
  return () => {
    loopStateListeners.get(sessionId)?.delete(cb);
  };
}
