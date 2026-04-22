import { getDefaults } from "../../lib/defaults.js";
import { createSlugId, dedupeIds, filterToKnownIds } from "../../lib/ids.js";
import { getKnownSkillIds } from "../../skills/service.js";
import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeDefinition,
  AgentPromptSections,
  ModeBehavior,
  ToolAccessScope,
} from "../types.js";
import { getBuiltInModeBehaviors, getBuiltInModeMeta, isModeBehavior } from "./modes.js";

const REQUIRED_TOOL_IDS = ["attachment"];

function normalizeToolIds(toolIds: string[]): string[] {
  return dedupeIds(toolIds, REQUIRED_TOOL_IDS);
}

function normalizeSkillIds(skillIds: string[], behavior: ModeBehavior): string[] {
  return filterToKnownIds(skillIds, getKnownSkillIds({ behavior }));
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

function resolveModeBehavior(value: unknown): ModeBehavior {
  return typeof value === "string" && isModeBehavior(value) ? value : "edit";
}

function buildUniqueModeId(seed: string, used: Set<string>): string {
  const base = createSlugId(seed) || "mode";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  const next = `${base}-${index}`;
  used.add(next);
  return next;
}

export function buildDefaultModeConfig(behavior: ModeBehavior): AgentModeConfig {
  const defaults = getDefaults();
  const template = defaults.agent.modeTemplates[behavior];
  return {
    promptSections: { ...defaults.agent.promptSections },
    modeInstruction: template.modeInstruction,
    toolIds: normalizeToolIds(template.toolIds),
    mcpIds: [],
    skillIds: [],
    toolAccessScopes: {},
    toolInstructions: { ...template.toolInstructions },
    mcpInstructions: {},
    skillInstructions: {},
    allowedToolNames: [...template.allowedToolNames],
    autonomousBudget: template.autonomousBudget ? { ...template.autonomousBudget } : undefined,
  };
}

export function normalizeModeConfig(
  behavior: ModeBehavior,
  current?: Partial<AgentModeConfig>,
): AgentModeConfig {
  const defaults = buildDefaultModeConfig(behavior);
  return {
    promptSections: mergePromptSections(defaults.promptSections, current?.promptSections),
    modeInstruction: current?.modeInstruction ?? defaults.modeInstruction,
    toolIds: normalizeToolIds(current?.toolIds ?? defaults.toolIds),
    mcpIds: [...new Set(current?.mcpIds ?? defaults.mcpIds)],
    skillIds: normalizeSkillIds(current?.skillIds ?? defaults.skillIds, behavior),
    toolAccessScopes: { ...defaults.toolAccessScopes, ...normalizeToolAccessScopes(current?.toolAccessScopes) },
    toolInstructions: { ...defaults.toolInstructions, ...current?.toolInstructions },
    mcpInstructions: { ...defaults.mcpInstructions, ...current?.mcpInstructions },
    skillInstructions: { ...defaults.skillInstructions, ...current?.skillInstructions },
    allowedToolNames: [...new Set(current?.allowedToolNames ?? defaults.allowedToolNames)],
    autonomousBudget: current?.autonomousBudget ?? defaults.autonomousBudget,
  };
}

export function buildDefaultModes(): AgentModeDefinition[] {
  return getBuiltInModeBehaviors().map((behavior) => {
    const meta = getBuiltInModeMeta(behavior);
    return {
      id: meta.id,
      label: meta.label,
      behavior,
      source: meta.source,
      enabled: true,
      config: buildDefaultModeConfig(behavior),
    };
  });
}

export function normalizeModeDefinitions(modes?: AgentModeDefinition[]): AgentModeDefinition[] {
  const sourceModes = modes && modes.length > 0 ? modes : buildDefaultModes();
  const usedIds = new Set<string>();

  return sourceModes.map((mode) => {
    const behavior = resolveModeBehavior(mode.behavior);
    const source = mode.source === "builtin" ? "builtin" : "custom";
    if (source === "builtin") {
      const meta = getBuiltInModeMeta(behavior);
      usedIds.add(meta.id);
      return {
        id: meta.id,
        label: meta.label,
        behavior,
        source,
        enabled: mode.enabled !== false,
        config: normalizeModeConfig(behavior, mode.config),
      };
    }

    const label = typeof mode.label === "string" && mode.label.trim().length > 0
      ? mode.label.trim()
      : getBuiltInModeMeta(behavior).label;
    const id = buildUniqueModeId(
      typeof mode.id === "string" && mode.id.trim().length > 0 ? mode.id : label,
      usedIds,
    );

    return {
      id,
      label,
      behavior,
      source,
      enabled: mode.enabled !== false,
      config: normalizeModeConfig(behavior, mode.config),
    };
  });
}

export function getEnabledAgentModes(agent: Pick<AgentDefinition, "modes">): AgentModeDefinition[] {
  return normalizeModeDefinitions(agent.modes).filter((mode) => mode.enabled);
}

export function resolveDefaultModeId(
  requestedModeId: string | undefined,
  modes: AgentModeDefinition[],
): string {
  const enabledModes = modes.filter((mode) => mode.enabled);
  if (enabledModes.length === 0) {
    throw new Error("At least one enabled mode is required.");
  }

  if (requestedModeId && enabledModes.some((mode) => mode.id === requestedModeId)) {
    return requestedModeId;
  }

  return enabledModes[0]!.id;
}

export function getAgentMode(agent: Pick<AgentDefinition, "modes">, modeId: string): AgentModeDefinition {
  const mode = normalizeModeDefinitions(agent.modes).find((entry) => entry.id === modeId);
  if (!mode) {
    throw new Error(`Mode "${modeId}" not found`);
  }
  if (!mode.enabled) {
    throw new Error(`Mode "${modeId}" is disabled`);
  }
  return mode;
}
