import type { AgentDefinition, CreateAgentBody, UpdateAgentBody, AgentLoopState } from "./types.js";
import * as store from "./lib/store.js";
import { getDefaults } from "../lib/defaults.js";
import { getSystemVariableNames } from "../systemprompt/lib/builder.js";

function normalizeMcpId(id: string): string {
  return id === "commands" ? "terminal" : id;
}

function normalizeAgent(agent: AgentDefinition): AgentDefinition {
  const mcpIds = [...new Set((agent.mcpIds ?? []).map(normalizeMcpId))];
  const mcpInstructions = Object.fromEntries(
    Object.entries(agent.mcpInstructions ?? {}).map(([id, instruction]) => [normalizeMcpId(id), instruction]),
  );
  return { ...agent, mcpIds, mcpInstructions };
}

export async function initAgentService(): Promise<void> {
  await store.initStore();
}

export function listAgents(): AgentDefinition[] {
  return store.listAgents().map(normalizeAgent);
}

export function getAgent(id: string): AgentDefinition {
  const agent = store.getAgent(id);
  if (!agent) throw new Error(`Agent "${id}" not found`);
  return normalizeAgent(agent);
}

export function listSystemVariables(): string[] {
  return getSystemVariableNames();
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
    systemPrompt: body.systemPrompt ?? "",
    maxIterations: body.maxIterations ?? getDefaults().agent.maxIterations,
    mcpIds: (body.mcpIds ?? []).map(normalizeMcpId),
    mcpInstructions: Object.fromEntries(
      Object.entries(body.mcpInstructions ?? {}).map(([mcpId, instruction]) => [normalizeMcpId(mcpId), instruction]),
    ),
    variables: body.variables ?? {},
    defaultModel: body.defaultModel,
    reasoningEffort: body.reasoningEffort,
    temperature: body.temperature,
    createdAt: now,
    updatedAt: now,
  };

  return store.createAgent(agent);
}

export async function updateAgent(id: string, body: UpdateAgentBody): Promise<AgentDefinition> {
  const patch: Partial<AgentDefinition> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.systemPrompt !== undefined) patch.systemPrompt = body.systemPrompt;
  if (body.maxIterations !== undefined) patch.maxIterations = body.maxIterations;
  if (body.mcpIds !== undefined) patch.mcpIds = body.mcpIds.map(normalizeMcpId);
  if (body.mcpInstructions !== undefined) {
    patch.mcpInstructions = Object.fromEntries(
      Object.entries(body.mcpInstructions).map(([mcpId, instruction]) => [normalizeMcpId(mcpId), instruction]),
    );
  }
  if (body.variables !== undefined) patch.variables = body.variables;
  if (body.defaultModel !== undefined) patch.defaultModel = body.defaultModel;
  if (body.reasoningEffort !== undefined) patch.reasoningEffort = body.reasoningEffort;
  if (body.temperature !== undefined) patch.temperature = body.temperature;
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
