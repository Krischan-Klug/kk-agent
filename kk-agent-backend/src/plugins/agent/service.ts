import type {
  AgentDefinition,
  AgentConfig,
  CreateAgentBody,
  UpdateAgentBody,
} from "./types.js";
import * as store from "./lib/store.js";
import { getDefaults } from "../lib/defaults.js";
import { createSlugId } from "../lib/ids.js";
import { compactLlmRequestConfig } from "kk-agent-contract";
import { getSystemVariableNames } from "../systemprompt/lib/builder.js";
import { normalizeAgentConfig } from "./lib/agent-config.js";
import { NotFoundError } from "../../lib/errors.js";

function normalizeAgent(agent: AgentDefinition): AgentDefinition {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    ...normalizeAgentConfig(agent),
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
  const id = createSlugId(body.name);
  const now = new Date().toISOString();

  const agent: AgentDefinition = {
    id,
    name: body.name,
    description: body.description ?? "",
    ...normalizeAgentConfig(body),
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
  const patch: Partial<AgentDefinition> = {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    ...normalizeAgentConfig({
      color: body.color ?? existing.color,
      promptSections: body.promptSections ?? existing.promptSections,
      toolIds: body.toolIds ?? existing.toolIds,
      mcpIds: body.mcpIds ?? existing.mcpIds,
      skillIds: body.skillIds ?? existing.skillIds,
      toolAccessScopes: body.toolAccessScopes ?? existing.toolAccessScopes,
      toolInstructions: body.toolInstructions ?? existing.toolInstructions,
      mcpInstructions: body.mcpInstructions ?? existing.mcpInstructions,
      allowedToolNames: body.allowedToolNames ?? existing.allowedToolNames,
    }),
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

type AgentConfigTransform = (
  config: AgentConfig,
  id: string,
) => AgentConfig;

const REMOVE_TRANSFORMS: Record<"tool" | "mcp" | "skill", AgentConfigTransform> = {
  tool(config, id) {
    const nextToolIds = config.toolIds.filter((entry) => entry !== id);
    const nextToolAccessScopes = { ...config.toolAccessScopes };
    const nextToolInstructions = { ...config.toolInstructions };
    delete nextToolAccessScopes[id];
    delete nextToolInstructions[id];
    if (
      nextToolIds.length === config.toolIds.length &&
      Object.keys(nextToolAccessScopes).length === Object.keys(config.toolAccessScopes).length &&
      Object.keys(nextToolInstructions).length === Object.keys(config.toolInstructions).length
    ) {
      return config;
    }
    return {
      ...config,
      toolIds: nextToolIds,
      toolAccessScopes: nextToolAccessScopes,
      toolInstructions: nextToolInstructions,
    };
  },
  mcp(config, id) {
    const nextMcpIds = config.mcpIds.filter((entry) => entry !== id);
    const nextMcpInstructions = { ...config.mcpInstructions };
    delete nextMcpInstructions[id];
    if (
      nextMcpIds.length === config.mcpIds.length &&
      Object.keys(nextMcpInstructions).length === Object.keys(config.mcpInstructions).length
    ) {
      return config;
    }
    return {
      ...config,
      mcpIds: nextMcpIds,
      mcpInstructions: nextMcpInstructions,
    };
  },
  skill(config, id) {
    const nextSkillIds = config.skillIds.filter((entry) => entry !== id);
    if (nextSkillIds.length === config.skillIds.length) return config;
    return {
      ...config,
      skillIds: nextSkillIds,
    };
  },
};

async function removeFromAllAgents(id: string, kind: "tool" | "mcp" | "skill"): Promise<void> {
  const transform = REMOVE_TRANSFORMS[kind];
  const updates = listAgents().map(async (agent) => {
    const nextConfig = transform(agent, id);
    if (nextConfig !== agent) {
      await store.updateAgent(agent.id, nextConfig);
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
