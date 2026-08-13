import { buildCapabilityInstructions } from "../../systemprompt/lib/builder.js";
import { getKnownMcpIds, getRunnableMcpIds } from "../../mcp/service.js";
import { getKnownSystemMcpIds, getRunnableSystemMcpIds } from "../../tools/service.js";
import { listSkills } from "../../skills/service.js";
import { filterToKnownIds } from "../../lib/ids.js";
import type { AgentDefinition, AgentModeDefinition } from "../../agent/types.js";
import { getEnabledAgentModes } from "../../agent/lib/mode-config.js";

const REQUIRED_SESSION_TOOL_IDS = ["attachment"];

function sanitizeMcpIds(mcpIds: string[]): string[] {
  return filterToKnownIds(mcpIds, getKnownMcpIds());
}

function sanitizeToolIds(toolIds: string[]): string[] {
  return filterToKnownIds(toolIds, getKnownSystemMcpIds(), REQUIRED_SESSION_TOOL_IDS);
}

function sanitizeSkillIds(skillIds: string[]): string[] {
  return filterToKnownIds(skillIds, listSkills().map((skill) => skill.id));
}

function getSessionRunnableMcpIds(activeToolIds: string[], activeMcpIds: string[]): string[] {
  const runnable = new Set([...getRunnableMcpIds(), ...getRunnableSystemMcpIds()]);
  return [...activeToolIds, ...activeMcpIds].filter((id) => runnable.has(id));
}

export function buildRunnableMcpInstructions(
  activeToolIds: string[],
  activeMcpIds: string[],
  agentInstructions: Record<string, string>,
): string {
  return buildCapabilityInstructions(getSessionRunnableMcpIds(activeToolIds, activeMcpIds), agentInstructions);
}

function resolveSessionIds(
  agent: Pick<AgentDefinition, "modes">,
  activeIds: string[] | undefined,
  accessor: (mode: AgentModeDefinition) => string[],
  sanitize: (ids: string[]) => string[],
): string[] {
  if (activeIds !== undefined) return sanitize(activeIds);
  const modeIds = getEnabledAgentModes(agent).flatMap((mode) => accessor(mode));
  return sanitize(modeIds);
}

export function resolveSessionToolIds(
  agent: Pick<AgentDefinition, "modes">,
  activeToolIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeToolIds, (mode) => mode.config.toolIds, sanitizeToolIds);
}

export function resolveSessionMcpIds(
  agent: Pick<AgentDefinition, "modes">,
  activeMcpIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeMcpIds, (mode) => mode.config.mcpIds, sanitizeMcpIds);
}

export function resolveSessionSkillIds(
  agent: Pick<AgentDefinition, "modes">,
  activeSkillIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeSkillIds, (mode) => mode.config.skillIds, sanitizeSkillIds);
}
