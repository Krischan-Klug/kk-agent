import { getDefaults } from "../../lib/defaults.js";
import { getKnownSkillIds } from "../../skills/service.js";
import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeConfigPatch,
  AgentPromptSections,
  ChatMode,
  ToolAccessScope,
} from "../types.js";
import { getChatModes } from "./modes.js";

const REQUIRED_TOOL_IDS = ["attachment"];

function normalizeToolIds(toolIds: string[]): string[] {
  return [...new Set([...toolIds, ...REQUIRED_TOOL_IDS])];
}

function normalizeMcpIds(mcpIds: string[]): string[] {
  return [...new Set(mcpIds)];
}

function normalizeSkillIds(skillIds: string[]): string[] {
  const knownIds = new Set(getKnownSkillIds());
  return [...new Set(skillIds)].filter((id) => knownIds.has(id));
}

function normalizeInstructions(instructions: Record<string, string> = {}): Record<string, string> {
  return { ...instructions };
}

function normalizeToolAccessScopes(scopes: Record<string, ToolAccessScope> = {}): Record<string, ToolAccessScope> {
  return Object.fromEntries(
    Object.entries(scopes)
      .map(([id, scope]) => [id, scope === "system" ? "system" : "user"]),
  );
}

function mergePromptSections(current: AgentPromptSections, patch?: Partial<AgentPromptSections>): AgentPromptSections {
  return { ...current, ...(patch ?? {}) };
}

export function buildDefaultModeConfig(mode: ChatMode): AgentModeConfig {
  const defaults = getDefaults();
  return {
    promptSections: { ...defaults.agent.promptSections },
    modeInstruction: defaults.agent.modeInstructions[mode],
    toolIds: normalizeToolIds(defaults.agent.modeToolIds[mode]),
    mcpIds: [],
    skillIds: [],
    toolAccessScopes: {},
    toolInstructions: { ...defaults.agent.modeToolInstructions[mode] },
    mcpInstructions: {},
    skillInstructions: {},
    allowedToolNames: [...defaults.agent.modeAllowedToolNames[mode]],
  };
}

export function normalizeModeConfig(
  mode: ChatMode,
  current?: Partial<AgentModeConfig>,
): AgentModeConfig {
  const defaults = buildDefaultModeConfig(mode);
  return {
    promptSections: mergePromptSections(defaults.promptSections, current?.promptSections),
    modeInstruction: current?.modeInstruction ?? defaults.modeInstruction,
    toolIds: normalizeToolIds(current?.toolIds ?? defaults.toolIds),
    mcpIds: normalizeMcpIds(current?.mcpIds ?? defaults.mcpIds),
    skillIds: normalizeSkillIds(current?.skillIds ?? defaults.skillIds),
    toolAccessScopes: { ...defaults.toolAccessScopes, ...normalizeToolAccessScopes(current?.toolAccessScopes) },
    toolInstructions: { ...defaults.toolInstructions, ...normalizeInstructions(current?.toolInstructions) },
    mcpInstructions: { ...defaults.mcpInstructions, ...normalizeInstructions(current?.mcpInstructions) },
    skillInstructions: { ...defaults.skillInstructions, ...normalizeInstructions(current?.skillInstructions) },
    allowedToolNames: [...new Set(current?.allowedToolNames ?? defaults.allowedToolNames)],
  };
}

export function normalizeModeConfigs(
  modeConfigs?: Partial<Record<ChatMode, Partial<AgentModeConfig>>>,
): Record<ChatMode, AgentModeConfig> {
  const result = {} as Record<ChatMode, AgentModeConfig>;
  for (const mode of getChatModes()) {
    result[mode] = normalizeModeConfig(mode, modeConfigs?.[mode]);
  }
  return result;
}

function compactPromptSections(
  current: AgentPromptSections,
  defaults: AgentPromptSections,
): Partial<AgentPromptSections> | undefined {
  const next = Object.fromEntries(
    Object.entries(current).filter(([key, value]) => value !== defaults[key as keyof AgentPromptSections]),
  ) as Partial<AgentPromptSections>;
  return Object.keys(next).length > 0 ? next : undefined;
}

function compactInstructions(current: Record<string, string>, defaults: Record<string, string> = {}): Record<string, string> | undefined {
  const next = Object.fromEntries(
    Object.entries(current).filter(([key, value]) => value !== (defaults[key] ?? "")),
  );
  return Object.keys(next).length > 0 ? next : undefined;
}

export function compactModeConfig(mode: ChatMode, current?: Partial<AgentModeConfig>): AgentModeConfigPatch {
  const normalized = normalizeModeConfig(mode, current);
  const defaults = buildDefaultModeConfig(mode);
  const compacted: AgentModeConfigPatch = {};

  const promptSections = compactPromptSections(normalized.promptSections, defaults.promptSections);
  if (promptSections) compacted.promptSections = promptSections;
  if (normalized.modeInstruction !== defaults.modeInstruction) compacted.modeInstruction = normalized.modeInstruction;
  if (JSON.stringify(normalized.toolIds) !== JSON.stringify(defaults.toolIds)) compacted.toolIds = normalized.toolIds;
  if (normalized.mcpIds.length > 0) compacted.mcpIds = normalized.mcpIds;
  if (normalized.skillIds.length > 0) compacted.skillIds = normalized.skillIds;
  if (Object.keys(normalized.toolAccessScopes).length > 0) compacted.toolAccessScopes = normalized.toolAccessScopes;

  const toolInstructions = compactInstructions(normalized.toolInstructions, defaults.toolInstructions);
  if (toolInstructions) compacted.toolInstructions = toolInstructions;

  const mcpInstructions = compactInstructions(normalized.mcpInstructions);
  if (mcpInstructions) compacted.mcpInstructions = mcpInstructions;

  const skillInstructions = compactInstructions(normalized.skillInstructions);
  if (skillInstructions) compacted.skillInstructions = skillInstructions;

  if (JSON.stringify(normalized.allowedToolNames) !== JSON.stringify(defaults.allowedToolNames)) {
    compacted.allowedToolNames = normalized.allowedToolNames;
  }

  return compacted;
}

export function compactModeConfigs(
  modeConfigs: Partial<Record<ChatMode, Partial<AgentModeConfig>>>,
): Partial<Record<ChatMode, AgentModeConfigPatch>> {
  const result: Partial<Record<ChatMode, AgentModeConfigPatch>> = {};
  for (const mode of getChatModes()) {
    const compacted = compactModeConfig(mode, modeConfigs[mode]);
    if (Object.keys(compacted).length > 0) result[mode] = compacted;
  }
  return result;
}

export function applyModeConfigPatch(
  mode: ChatMode,
  current: AgentModeConfig | undefined,
  patch?: AgentModeConfigPatch,
): AgentModeConfig {
  const normalizedCurrent = normalizeModeConfig(mode, current);
  return {
    promptSections: mergePromptSections(normalizedCurrent.promptSections, patch?.promptSections),
    modeInstruction: patch?.modeInstruction ?? normalizedCurrent.modeInstruction,
    toolIds: patch?.toolIds ? normalizeToolIds(patch.toolIds) : normalizedCurrent.toolIds,
    mcpIds: patch?.mcpIds ? normalizeMcpIds(patch.mcpIds) : normalizedCurrent.mcpIds,
    skillIds: patch?.skillIds ? normalizeSkillIds(patch.skillIds) : normalizedCurrent.skillIds,
    toolAccessScopes: patch?.toolAccessScopes
      ? normalizeToolAccessScopes(patch.toolAccessScopes)
      : normalizedCurrent.toolAccessScopes,
    toolInstructions: patch?.toolInstructions
      ? normalizeInstructions(patch.toolInstructions)
      : normalizedCurrent.toolInstructions,
    mcpInstructions: patch?.mcpInstructions
      ? normalizeInstructions(patch.mcpInstructions)
      : normalizedCurrent.mcpInstructions,
    skillInstructions: patch?.skillInstructions
      ? normalizeInstructions(patch.skillInstructions)
      : normalizedCurrent.skillInstructions,
    allowedToolNames: [...new Set(patch?.allowedToolNames ?? normalizedCurrent.allowedToolNames)],
  };
}

export function getModeConfig(agent: Pick<AgentDefinition, "modeConfigs">, mode: ChatMode): AgentModeConfig {
  return normalizeModeConfig(mode, agent.modeConfigs[mode]);
}
