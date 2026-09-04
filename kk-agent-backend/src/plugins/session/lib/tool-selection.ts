import { buildCapabilityInstructions } from "../../systemprompt/lib/builder.js";
import { getKnownMcpIds, getRunnableMcpIds } from "../../mcp/service.js";
import { getKnownInternalToolIds, getRunnableInternalToolIds } from "../../tools/service.js";
import { listSkills } from "../../skills/service.js";
import { filterToKnownIds } from "../../lib/ids.js";
import type { AgentDefinition } from "../../agent/types.js";

const REQUIRED_SESSION_TOOL_IDS = ["attachment"];

function sanitizeMcpIds(mcpIds: string[]): string[] {
  return filterToKnownIds(mcpIds, getKnownMcpIds());
}

function sanitizeToolIds(toolIds: string[]): string[] {
  return filterToKnownIds(toolIds, getKnownInternalToolIds(), REQUIRED_SESSION_TOOL_IDS);
}

function sanitizeSkillIds(skillIds: string[]): string[] {
  return filterToKnownIds(skillIds, listSkills().map((skill) => skill.id));
}

function getSessionRunnableMcpIds(activeToolIds: string[], activeMcpIds: string[]): string[] {
  const runnable = new Set([...getRunnableMcpIds(), ...getRunnableInternalToolIds()]);
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
  configuredIds: string[],
  activeIds: string[] | undefined,
  sanitize: (ids: string[]) => string[],
): string[] {
  const configured = new Set(configuredIds);
  return sanitize((activeIds ?? configuredIds).filter((id) => configured.has(id)));
}

export function resolveSessionToolIds(
  agent: Pick<AgentDefinition, "toolIds">,
  activeToolIds?: string[],
): string[] {
  return resolveSessionIds(agent.toolIds, activeToolIds, sanitizeToolIds);
}

export function resolveSessionMcpIds(
  agent: Pick<AgentDefinition, "mcpIds">,
  activeMcpIds?: string[],
): string[] {
  return resolveSessionIds(agent.mcpIds, activeMcpIds, sanitizeMcpIds);
}

export function resolveSessionSkillIds(
  agent: Pick<AgentDefinition, "skillIds">,
  activeSkillIds?: string[],
): string[] {
  return resolveSessionIds(agent.skillIds, activeSkillIds, sanitizeSkillIds);
}
