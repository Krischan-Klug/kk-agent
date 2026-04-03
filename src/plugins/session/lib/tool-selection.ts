import { buildCapabilityInstructions } from "../../systemprompt/service.js";
import { getKnownMcpIds, getRunnableMcpIds } from "../../mcp/service.js";
import { getKnownSystemMcpIds, getRunnableSystemMcpIds } from "../../tools/service.js";
import { normalizeMcpId } from "../../lib/ids.js";

const REQUIRED_SESSION_TOOL_IDS = ["attachment"];

export function sanitizeMcpIds(mcpIds: string[]): string[] {
  const knownIds = new Set(getKnownMcpIds());
  return [...new Set(mcpIds.map(normalizeMcpId))].filter((id) => knownIds.has(id));
}

export function sanitizeToolIds(toolIds: string[]): string[] {
  const knownIds = new Set(getKnownSystemMcpIds());
  return [...new Set([...toolIds, ...REQUIRED_SESSION_TOOL_IDS].map(normalizeMcpId))].filter((id) => knownIds.has(id));
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
  agent: { modeConfigs?: Partial<Record<"plan" | "edit", { toolIds?: string[] }>> },
  activeToolIds?: string[],
): string[] {
  if (activeToolIds !== undefined) return sanitizeToolIds(activeToolIds);
  const modeToolIds = Object.values(agent.modeConfigs ?? {}).flatMap((mode) => mode?.toolIds ?? []);
  return sanitizeToolIds(modeToolIds);
}

export function resolveSessionMcpIds(
  agent: { modeConfigs?: Partial<Record<"plan" | "edit", { mcpIds?: string[] }>> },
  activeMcpIds?: string[],
): string[] {
  if (activeMcpIds !== undefined) return sanitizeMcpIds(activeMcpIds);
  const modeMcpIds = Object.values(agent.modeConfigs ?? {}).flatMap((mode) => mode?.mcpIds ?? []);
  return sanitizeMcpIds(modeMcpIds);
}
