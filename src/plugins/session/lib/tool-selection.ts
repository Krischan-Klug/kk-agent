import { buildCapabilityInstructions } from "../../systemprompt/service.js";
import { getKnownMcpIds, getRunnableMcpIds } from "../../mcp/service.js";
import { getKnownSystemMcpIds, getRunnableSystemMcpIds } from "../../tools/service.js";
import { listSkills } from "../../skills/service.js";
import type { AgentDefinition } from "../../agent/types.js";
import { getChatModes } from "../../agent/lib/modes.js";
import { getModeConfig } from "../../agent/lib/mode-config.js";

const REQUIRED_SESSION_TOOL_IDS = ["attachment"];

export function sanitizeMcpIds(mcpIds: string[]): string[] {
  const knownIds = new Set(getKnownMcpIds());
  return [...new Set(mcpIds)].filter((id) => knownIds.has(id));
}

export function sanitizeToolIds(toolIds: string[]): string[] {
  const knownIds = new Set(getKnownSystemMcpIds());
  return [...new Set([...toolIds, ...REQUIRED_SESSION_TOOL_IDS])].filter((id) => knownIds.has(id));
}

export function sanitizeSkillIds(skillIds: string[]): string[] {
  const knownIds = new Set(
    listSkills()
      .filter((skill) => skill.active)
      .map((skill) => skill.id),
  );
  return [...new Set(skillIds)].filter((id) => knownIds.has(id));
}

export function getSessionRunnableMcpIds(activeToolIds: string[], activeMcpIds: string[]): string[] {
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

export function resolveSessionToolIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeToolIds?: string[],
): string[] {
  if (activeToolIds !== undefined) return sanitizeToolIds(activeToolIds);
  const modeToolIds = getChatModes().flatMap((mode) => getModeConfig(agent, mode).toolIds);
  return sanitizeToolIds(modeToolIds);
}

export function resolveSessionMcpIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeMcpIds?: string[],
): string[] {
  if (activeMcpIds !== undefined) return sanitizeMcpIds(activeMcpIds);
  const modeMcpIds = getChatModes().flatMap((mode) => getModeConfig(agent, mode).mcpIds);
  return sanitizeMcpIds(modeMcpIds);
}

export function resolveSessionSkillIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeSkillIds?: string[],
): string[] {
  if (activeSkillIds !== undefined) return sanitizeSkillIds(activeSkillIds);
  const modeSkillIds = getChatModes().flatMap((mode) => getModeConfig(agent, mode).skillIds);
  return sanitizeSkillIds(modeSkillIds);
}
