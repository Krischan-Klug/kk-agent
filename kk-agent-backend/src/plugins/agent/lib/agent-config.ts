import type {
  AgentConfig,
  AgentPromptSections,
  ToolAccessScope,
} from "../types.js";
import { getDefaults } from "../../lib/defaults.js";
import { applyOverrides, diffOverrides } from "../../lib/overrides.js";
import { dedupeIds, filterToKnownIds } from "../../lib/ids.js";
import { getKnownSkillIds } from "../../skills/service.js";

const REQUIRED_TOOL_IDS = ["attachment"];

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizePromptSections(
  defaults: AgentPromptSections,
  current?: Partial<AgentPromptSections>,
): AgentPromptSections {
  return {
    identity: current?.identity ?? defaults.identity,
    system: current?.system ?? defaults.system,
    runtime: current?.runtime ?? defaults.runtime,
    security: current?.security ?? defaults.security,
    toolUsage: current?.toolUsage ?? defaults.toolUsage,
    communication: current?.communication ?? defaults.communication,
  };
}

function normalizeToolAccessScopes(
  scopes: Record<string, ToolAccessScope> = {},
): Record<string, ToolAccessScope> {
  return Object.fromEntries(
    Object.entries(scopes).map(([id, scope]) => [id, scope === "system" ? "system" : "user"]),
  );
}

export function buildDefaultAgentConfig(): AgentConfig {
  const defaults = getDefaults().agent;
  return {
    color: defaults.color,
    promptSections: { ...defaults.promptSections },
    toolIds: dedupeIds(defaults.toolIds, REQUIRED_TOOL_IDS),
    mcpIds: [...defaults.mcpIds],
    skillIds: getKnownSkillIds(),
    toolAccessScopes: { ...defaults.toolAccessScopes },
    toolInstructions: { ...defaults.toolInstructions },
    mcpInstructions: { ...defaults.mcpInstructions },
    allowedToolNames: [...defaults.allowedToolNames],
  };
}

export function normalizeAgentConfig(current?: Partial<AgentConfig>): AgentConfig {
  const defaults = buildDefaultAgentConfig();
  return {
    color: normalizeColor(current?.color, defaults.color),
    promptSections: normalizePromptSections(defaults.promptSections, current?.promptSections),
    toolIds: dedupeIds(current?.toolIds ?? defaults.toolIds, REQUIRED_TOOL_IDS),
    mcpIds: [...new Set(current?.mcpIds ?? defaults.mcpIds)],
    skillIds: filterToKnownIds(current?.skillIds ?? defaults.skillIds, getKnownSkillIds()),
    toolAccessScopes: {
      ...defaults.toolAccessScopes,
      ...normalizeToolAccessScopes(current?.toolAccessScopes),
    },
    toolInstructions: { ...defaults.toolInstructions, ...current?.toolInstructions },
    mcpInstructions: { ...defaults.mcpInstructions, ...current?.mcpInstructions },
    allowedToolNames: [...new Set(current?.allowedToolNames ?? defaults.allowedToolNames)],
  };
}

export function expandAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return applyOverrides(buildDefaultAgentConfig(), overrides);
}

export function compactAgentConfig(config: AgentConfig): Partial<AgentConfig> {
  return diffOverrides(buildDefaultAgentConfig(), config);
}
