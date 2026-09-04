import type {
  AgentConfig,
} from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
export { PROMPT_SECTION_META } from "@/lib/promptSections";

export const OVERRIDE_EMOJI = "\u270F\uFE0F";
export const RESET_EMOJI = "\u21BA";

export function getCapabilityToolNames(capability: RuntimeCapability): string[] {
  return capability.tools.map((tool) => tool.name);
}

export function normalizeAllowedToolNames(
  nextAllowed: string[],
  agentConfig: AgentConfig,
  internalTools: RuntimeCapability[],
  mcps: RuntimeCapability[],
): string[] {
  const activeCapabilityIds = new Set([...agentConfig.toolIds, ...agentConfig.mcpIds]);
  const activeToolNames = new Set(
    [...internalTools, ...mcps]
      .filter((capability) => activeCapabilityIds.has(capability.id))
      .flatMap(getCapabilityToolNames),
  );
  return [...new Set(nextAllowed)].filter((name) => activeToolNames.has(name));
}

export function setCapabilityInstruction(
  current: Record<string, string>,
  capabilityId: string,
  nextValue: string,
  fallback?: string,
): Record<string, string> {
  const trimmedNext = nextValue.trim();
  const trimmedFallback = (fallback ?? "").trim();
  const next = { ...current };
  if (trimmedNext === trimmedFallback) {
    delete next[capabilityId];
    return next;
  }
  next[capabilityId] = nextValue;
  return next;
}

export function isScopeCapableTool(toolId: string): boolean {
  return toolId === "filesystem" || toolId === "terminal";
}
