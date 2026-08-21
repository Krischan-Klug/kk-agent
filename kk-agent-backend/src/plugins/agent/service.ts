import type {
  AgentDefinition,
  CreateAgentBody,
  UpdateAgentBody,
  AgentModeConfig,
  AgentModeDefinition,
} from "./types.js";
import * as store from "./lib/store.js";
import { getDefaults } from "../lib/defaults.js";
import { createSlugId } from "../lib/ids.js";
import { compactLlmRequestConfig } from "kk-agent-contract";
import { getSystemVariableNames } from "../systemprompt/lib/builder.js";
import { buildDefaultModes, normalizeModeDefinitions, resolveDefaultModeId } from "./lib/mode-config.js";
import { NotFoundError } from "../../lib/errors.js";

function normalizeAgent(agent: AgentDefinition): AgentDefinition {
  const defaults = getDefaults();
  const modes = normalizeModeDefinitions(agent.modes);
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    defaultModeId: resolveDefaultModeId(agent.defaultModeId ?? defaults.agent.defaultModeBehavior, modes),
    modes,
    variables: agent.variables ?? {},
    defaultProviderId: agent.defaultProviderId,
    defaultModel: agent.defaultModel,
    llmRequestConfig: compactLlmRequestConfig(agent.llmRequestConfig),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export async function initAgentService(): Promise<void> {
  await store.initStore();
}

export function listAgents(): AgentDefinition[] {
  return store.listAgents().map(normalizeAgent);
}

export function getAgent(id: string): AgentDefinition {
  const agent = store.getAgent(id);
  if (!agent) throw new NotFoundError("Agent", id);
  return normalizeAgent(agent);
}

export function listSystemVariables(): string[] {
  return getSystemVariableNames();
}

export function getAgentTemplates() {
  return structuredClone(getDefaults().agent);
}

export async function createAgent(body: CreateAgentBody): Promise<AgentDefinition> {
  const defaults = getDefaults();
  const id = createSlugId(body.name);
  const now = new Date().toISOString();
  const modes = normalizeModeDefinitions(body.modes ?? buildDefaultModes());

  const agent: AgentDefinition = {
    id,
    name: body.name,
    description: body.description ?? "",
    defaultModeId: resolveDefaultModeId(body.defaultModeId ?? defaults.agent.defaultModeBehavior, modes),
    modes,
    variables: body.variables ?? {},
    defaultProviderId: body.defaultProviderId,
    defaultModel: body.defaultModel,
    llmRequestConfig: compactLlmRequestConfig(body.llmRequestConfig),
    createdAt: now,
    updatedAt: now,
  };

  return normalizeAgent(await store.createAgent(agent));
}

export async function updateAgent(id: string, body: UpdateAgentBody): Promise<AgentDefinition> {
  const existing = getAgent(id);
  const nextModes = body.modes !== undefined ? normalizeModeDefinitions(body.modes) : existing.modes;
  const patch: Partial<AgentDefinition> = {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    defaultModeId: resolveDefaultModeId(body.defaultModeId ?? existing.defaultModeId, nextModes),
    modes: nextModes,
    variables: body.variables ?? existing.variables,
    defaultProviderId: body.defaultProviderId ?? existing.defaultProviderId,
    defaultModel: body.defaultModel ?? existing.defaultModel,
    llmRequestConfig: body.llmRequestConfig !== undefined
      ? compactLlmRequestConfig(body.llmRequestConfig)
      : existing.llmRequestConfig,
  };

  return normalizeAgent(await store.updateAgent(id, {
    ...existing,
    ...patch,
  }));
}

export async function deleteAgent(id: string): Promise<void> {
  const removed = await store.deleteAgent(id);
  if (!removed) throw new NotFoundError("Agent", id);
}

type ModeConfigTransform = (
  modeConfig: AgentModeConfig,
  id: string,
) => AgentModeConfig;

const REMOVE_TRANSFORMS: Record<"tool" | "mcp" | "skill", ModeConfigTransform> = {
  tool(modeConfig, id) {
    const nextToolIds = modeConfig.toolIds.filter((entry) => entry !== id);
    const nextToolAccessScopes = { ...modeConfig.toolAccessScopes };
    const nextToolInstructions = { ...modeConfig.toolInstructions };
    delete nextToolAccessScopes[id];
    delete nextToolInstructions[id];
    if (
      nextToolIds.length === modeConfig.toolIds.length &&
      Object.keys(nextToolAccessScopes).length === Object.keys(modeConfig.toolAccessScopes).length &&
      Object.keys(nextToolInstructions).length === Object.keys(modeConfig.toolInstructions).length
    ) {
      return modeConfig;
    }
    return {
      ...modeConfig,
      toolIds: nextToolIds,
      toolAccessScopes: nextToolAccessScopes,
      toolInstructions: nextToolInstructions,
    };
  },
  mcp(modeConfig, id) {
    const nextMcpIds = modeConfig.mcpIds.filter((entry) => entry !== id);
    const nextMcpInstructions = { ...modeConfig.mcpInstructions };
    delete nextMcpInstructions[id];
    if (
      nextMcpIds.length === modeConfig.mcpIds.length &&
      Object.keys(nextMcpInstructions).length === Object.keys(modeConfig.mcpInstructions).length
    ) {
      return modeConfig;
    }
    return {
      ...modeConfig,
      mcpIds: nextMcpIds,
      mcpInstructions: nextMcpInstructions,
    };
  },
  skill(modeConfig, id) {
    const nextSkillIds = modeConfig.skillIds.filter((entry) => entry !== id);
    if (nextSkillIds.length === modeConfig.skillIds.length) return modeConfig;
    return {
      ...modeConfig,
      skillIds: nextSkillIds,
    };
  },
};

async function removeFromAllAgents(id: string, kind: "tool" | "mcp" | "skill"): Promise<void> {
  const transform = REMOVE_TRANSFORMS[kind];
  const updates = listAgents().map(async (agent) => {
    let changed = false;
    const nextModes: AgentModeDefinition[] = agent.modes.map((mode) => {
      const nextConfig = transform(mode.config, id);
      if (nextConfig !== mode.config) {
        changed = true;
        return {
          ...mode,
          config: nextConfig,
        };
      }
      return mode;
    });

    if (changed) {
      await store.updateAgent(agent.id, { modes: nextModes });
    }
  });
  await Promise.all(updates);
}

export async function removeMcpFromAgents(mcpId: string): Promise<void> {
  return removeFromAllAgents(mcpId, "mcp");
}

export async function removeSkillFromAgents(skillId: string): Promise<void> {
  return removeFromAllAgents(skillId, "skill");
}
