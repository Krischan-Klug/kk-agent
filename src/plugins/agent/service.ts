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
import { compactLlmRequestConfig } from "../provider/lib/request-config.js";
import { getSystemVariableNames } from "../systemprompt/index.js";
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
    llmRequestConfig: compactLlmRequestConfig(agent.llmRequestConfig),
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
    variables: body.variables ?? {},
    defaultProviderId: body.defaultProviderId,
    defaultModel: body.defaultModel,
    llmRequestConfig: compactLlmRequestConfig(body.llmRequestConfig),
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
  if (body.variables !== undefined) patch.variables = body.variables;
  if (body.defaultProviderId !== undefined) patch.defaultProviderId = body.defaultProviderId;
  if (body.defaultModel !== undefined) patch.defaultModel = body.defaultModel;
  if (body.llmRequestConfig !== undefined) patch.llmRequestConfig = compactLlmRequestConfig(body.llmRequestConfig);
  return normalizeAgent(await store.updateAgent(id, patch));
}

export async function deleteAgent(id: string): Promise<void> {
  const removed = await store.deleteAgent(id);
  if (!removed) throw new Error(`Agent "${id}" not found`);
}

type ModeConfigTransform = (
  modeConfig: AgentDefinition["modeConfigs"][ChatMode],
  id: string,
) => AgentDefinition["modeConfigs"][ChatMode];

const REMOVE_TRANSFORMS: Record<"tool" | "mcp" | "skill", ModeConfigTransform> = {
  tool(modeConfig, id) {
    const toolAccessScopes = { ...modeConfig.toolAccessScopes };
    const toolInstructions = { ...modeConfig.toolInstructions };
    delete toolAccessScopes[id];
    delete toolInstructions[id];
    return {
      ...modeConfig,
      toolIds: modeConfig.toolIds.filter((entry) => entry !== id),
      toolAccessScopes,
      toolInstructions,
    };
  },
  mcp(modeConfig, id) {
    const mcpInstructions = { ...modeConfig.mcpInstructions };
    delete mcpInstructions[id];
    return {
      ...modeConfig,
      mcpIds: modeConfig.mcpIds.filter((entry) => entry !== id),
      mcpInstructions,
    };
  },
  skill(modeConfig, id) {
    const skillInstructions = { ...modeConfig.skillInstructions };
    delete skillInstructions[id];
    return {
      ...modeConfig,
      skillIds: modeConfig.skillIds.filter((entry) => entry !== id),
      skillInstructions,
    };
  },
};

async function removeFromAllAgents(id: string, kind: "tool" | "mcp" | "skill"): Promise<void> {
  const transform = REMOVE_TRANSFORMS[kind];
  const updates = listAgents().map(async (agent) => {
    const nextModeConfigs = { ...agent.modeConfigs };
    let changed = false;
    for (const mode of getChatModes()) {
      const current = nextModeConfigs[mode];
      if (!current) continue;
      const next = transform(current, id);
      if (next !== current) {
        nextModeConfigs[mode] = next;
        changed = true;
      }
    }
    if (changed) {
      await store.updateAgent(agent.id, { modeConfigs: nextModeConfigs });
    }
  });
  await Promise.all(updates);
}

export async function removeMcpFromAgents(mcpId: string): Promise<void> {
  return removeFromAllAgents(mcpId, "mcp");
}

export async function removeToolFromAgents(toolId: string): Promise<void> {
  return removeFromAllAgents(toolId, "tool");
}

export async function removeSkillFromAgents(skillId: string): Promise<void> {
  return removeFromAllAgents(skillId, "skill");
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

const loopAbortControllers = new Map<string, AbortController>();

export function createLoopAbortController(sessionId: string): AbortController {
  loopAbortControllers.get(sessionId)?.abort();
  const controller = new AbortController();
  loopAbortControllers.set(sessionId, controller);
  return controller;
}

export function abortLoop(sessionId: string): boolean {
  const controller = loopAbortControllers.get(sessionId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function clearLoopAbortController(sessionId: string): void {
  loopAbortControllers.delete(sessionId);
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
