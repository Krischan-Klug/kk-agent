import { buildCapabilityInstructions } from "../../systemprompt/service.js";
import { getAllMcpsCached, getKnownMcpIds, getRunnableMcpIds } from "../../mcp/service.js";
import { getInternalToolById, getKnownSystemMcpIds, getRunnableSystemMcpIds } from "../../tools/service.js";
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

function resolveSessionIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeIds: string[] | undefined,
  accessor: (config: ReturnType<typeof getModeConfig>) => string[],
  sanitize: (ids: string[]) => string[],
): string[] {
  if (activeIds !== undefined) return sanitize(activeIds);
  const modeIds = getChatModes().flatMap((mode) => accessor(getModeConfig(agent, mode)));
  return sanitize(modeIds);
}

export function resolveSessionToolIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeToolIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeToolIds, (c) => c.toolIds, sanitizeToolIds);
}

export function resolveSessionMcpIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeMcpIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeMcpIds, (c) => c.mcpIds, sanitizeMcpIds);
}

export function resolveSessionSkillIds(
  agent: Pick<AgentDefinition, "modeConfigs">,
  activeSkillIds?: string[],
): string[] {
  return resolveSessionIds(agent, activeSkillIds, (c) => c.skillIds, sanitizeSkillIds);
}

/**
 * Returns the skill ids that are linked to the given internal tools and MCPs.
 * Used to extend a session's effective skill catalog with skills declared on the
 * tool/MCP itself, so admins can attach reusable workflow skills once per
 * tool/MCP instead of per agent.
 */
export function collectLinkedSkillIds(
  activeToolIds: string[],
  activeMcpIds: string[],
): string[] {
  const collected = new Set<string>();
  for (const id of activeToolIds) {
    const tool = getInternalToolById(id);
    for (const skillId of tool?.skillIds ?? []) collected.add(skillId);
  }
  for (const mcp of getAllMcpsCached()) {
    if (!activeMcpIds.includes(mcp.id)) continue;
    for (const skillId of mcp.skillIds ?? []) collected.add(skillId);
  }
  return sanitizeSkillIds([...collected]);
}

