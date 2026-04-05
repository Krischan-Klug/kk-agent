import type {
  AgentDefinition,
  CreateAgentBody,
  UpdateAgentBody,
  AgentLoopState,
  ChatMode,
} from "./types.js";
import * as store from "./lib/store.js";
import { getDefaults } from "../lib/defaults.js";
import { createSlugId } from "../lib/ids.js";
import { normalizeCanonicalReasoningLevel } from "../provider/lib/capabilities.js";
import { getSystemVariableNames } from "../systemprompt/lib/builder.js";
import { getChatModes } from "./lib/modes.js";
import { applyModeConfigPatch, compactModeConfigs, normalizeModeConfigs } from "./lib/mode-config.js";

function compactAgentForStore(agent: AgentDefinition): AgentDefinition {
  return {
    ...agent,
    modeConfigs: compactModeConfigs(agent.modeConfigs) as AgentDefinition["modeConfigs"],
  };
}

function normalizeAgent(agent: AgentDefinition): AgentDefinition {
  const defaults = getDefaults();
  const defaultChatMode = agent.defaultChatMode ?? defaults.agent.defaultChatMode;
  return {
    ...agent,
    defaultChatMode,
    reasoningEffort: normalizeCanonicalReasoningLevel(agent.reasoningEffort),
    modeConfigs: normalizeModeConfigs(agent.modeConfigs),
  };
}

function normalizeModePatches(
  existing: AgentDefinition["modeConfigs"],
  patch?: UpdateAgentBody["modeConfigs"] | CreateAgentBody["modeConfigs"],
): AgentDefinition["modeConfigs"] {
  const result = normalizeModeConfigs(existing);
  if (!patch) return result;
  for (const mode of getChatModes()) {
    result[mode] = applyModeConfigPatch(mode, result[mode], patch[mode]);
  }
  return result;
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
  const defaults = getDefaults();
  const id = createSlugId(body.name);
  const now = new Date().toISOString();
  const defaultChatMode = body.defaultChatMode ?? defaults.agent.defaultChatMode;

  const agent: AgentDefinition = {
    id,
    name: body.name,
    description: body.description ?? "",
    defaultChatMode,
    modeConfigs: normalizeModePatches({} as AgentDefinition["modeConfigs"], body.modeConfigs),
    maxIterations: body.maxIterations ?? defaults.agent.maxIterations,
    variables: body.variables ?? {},
    defaultModel: body.defaultModel,
    reasoningEffort: normalizeCanonicalReasoningLevel(body.reasoningEffort),
    temperature: body.temperature,
    createdAt: now,
    updatedAt: now,
  };

  return normalizeAgent(await store.createAgent(compactAgentForStore(agent)));
}

export async function updateAgent(id: string, body: UpdateAgentBody): Promise<AgentDefinition> {
  const existing = getAgent(id);
  const patch: Partial<AgentDefinition> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.defaultChatMode !== undefined) patch.defaultChatMode = body.defaultChatMode;
  if (body.modeConfigs !== undefined) {
    patch.modeConfigs = compactModeConfigs(
      normalizeModePatches(existing.modeConfigs, body.modeConfigs),
    ) as AgentDefinition["modeConfigs"];
  }
  if (body.maxIterations !== undefined) patch.maxIterations = body.maxIterations;
  if (body.variables !== undefined) patch.variables = body.variables;
  if (body.defaultModel !== undefined) patch.defaultModel = body.defaultModel;
  if (body.reasoningEffort !== undefined) patch.reasoningEffort = normalizeCanonicalReasoningLevel(body.reasoningEffort);
  if (body.temperature !== undefined) patch.temperature = body.temperature;
  return normalizeAgent(await store.updateAgent(id, patch));
}

export async function deleteAgent(id: string): Promise<void> {
  const removed = await store.deleteAgent(id);
  if (!removed) throw new Error(`Agent "${id}" not found`);
}

function removeCapabilityFromModeConfig(
  modeConfig: AgentDefinition["modeConfigs"][ChatMode] | undefined,
  capabilityId: string,
  kind: "tool" | "mcp",
) {
  if (!modeConfig) return modeConfig;
  const toolIds = kind === "tool" ? modeConfig.toolIds.filter((entry) => entry !== capabilityId) : modeConfig.toolIds;
  const mcpIds = kind === "mcp" ? modeConfig.mcpIds.filter((entry) => entry !== capabilityId) : modeConfig.mcpIds;
  const toolAccessScopes = { ...modeConfig.toolAccessScopes };
  const toolInstructions = { ...modeConfig.toolInstructions };
  const mcpInstructions = { ...modeConfig.mcpInstructions };
  if (kind === "tool") delete toolAccessScopes[capabilityId];
  if (kind === "tool") delete toolInstructions[capabilityId];
  if (kind === "mcp") delete mcpInstructions[capabilityId];
  return { ...modeConfig, toolIds, mcpIds, toolAccessScopes, toolInstructions, mcpInstructions };
}

function removeSkillFromModeConfig(
  modeConfig: AgentDefinition["modeConfigs"][ChatMode] | undefined,
  skillId: string,
) {
  if (!modeConfig) return modeConfig;
  const skillIds = modeConfig.skillIds.filter((entry) => entry !== skillId);
  const skillInstructions = { ...modeConfig.skillInstructions };
  delete skillInstructions[skillId];
  return { ...modeConfig, skillIds, skillInstructions };
}

export async function removeMcpFromAgents(mcpId: string): Promise<void> {
  const updates = listAgents().map(async (agent) => {
    const nextModeConfigs = { ...agent.modeConfigs };
    let changed = false;
    for (const mode of getChatModes()) {
      const current = agent.modeConfigs[mode];
      const next = removeCapabilityFromModeConfig(current, mcpId, "mcp");
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        nextModeConfigs[mode] = next!;
        changed = true;
      }
    }
    if (changed) {
      await store.updateAgent(agent.id, { modeConfigs: nextModeConfigs });
    }
  });
  await Promise.all(updates);
}

export async function removeToolFromAgents(toolId: string): Promise<void> {
  const updates = listAgents().map(async (agent) => {
    const nextModeConfigs = { ...agent.modeConfigs };
    let changed = false;
    for (const mode of getChatModes()) {
      const current = agent.modeConfigs[mode];
      const next = removeCapabilityFromModeConfig(current, toolId, "tool");
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        nextModeConfigs[mode] = next!;
        changed = true;
      }
    }
    if (changed) {
      await store.updateAgent(agent.id, { modeConfigs: nextModeConfigs });
    }
  });
  await Promise.all(updates);
}

export async function removeSkillFromAgents(skillId: string): Promise<void> {
  const updates = listAgents().map(async (agent) => {
    const nextModeConfigs = { ...agent.modeConfigs };
    let changed = false;
    for (const mode of getChatModes()) {
      const current = agent.modeConfigs[mode];
      const next = removeSkillFromModeConfig(current, skillId);
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        nextModeConfigs[mode] = next!;
        changed = true;
      }
    }
    if (changed) {
      await store.updateAgent(agent.id, { modeConfigs: nextModeConfigs });
    }
  });
  await Promise.all(updates);
}

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
