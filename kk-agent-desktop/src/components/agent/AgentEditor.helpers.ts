import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeDefinition,
  AppDefaults,
  ModeBehavior,
} from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
export { PROMPT_SECTION_META } from "@/lib/promptSections";

export const MODE_BEHAVIORS: ModeBehavior[] = ["plan", "edit"];

export const OVERRIDE_EMOJI = "\u270F\uFE0F";
export const RESET_EMOJI = "\u21BA";

function slugifyModeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "mode";
}

function buildUniqueModeId(seed: string, existingIds: string[]): string {
  const base = slugifyModeId(seed);
  if (!existingIds.includes(base)) return base;
  let index = 2;
  while (existingIds.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

type AgentTemplates = AppDefaults["agent"];

function buildModeConfigFromDefaults(behavior: ModeBehavior, defaults: AgentTemplates | null): AgentModeConfig {
  const template = defaults?.modeTemplates[behavior];
  return {
    promptSections: { ...(defaults?.promptSections ?? {
      identity: "",
      system: "",
      runtime: "",
      security: "",
      toolUsage: "",
      communication: "",
    }) },
    modeInstruction: template?.modeInstruction ?? "",
    toolIds: [...(template?.toolIds ?? [])],
    mcpIds: [],
    skillIds: [],
    toolAccessScopes: {},
    toolInstructions: { ...(template?.toolInstructions ?? {}) },
    mcpInstructions: {},
    allowedToolNames: [...(template?.allowedToolNames ?? [])],
  };
}

export function createCustomMode(
  agent: AgentDefinition,
  defaults: AgentTemplates | null,
  behavior: ModeBehavior = "edit",
): AgentModeDefinition {
  const existingIds = agent.modes.map((mode) => mode.id);
  return {
    id: buildUniqueModeId("custom-mode", existingIds),
    label: "Custom Mode",
    behavior,
    source: "custom",
    color: behavior === "plan" ? "#60a5fa" : "#fbbf24",
    enabled: true,
    config: {
      ...buildModeConfigFromDefaults(behavior, defaults),
      skillIds: [...new Set(agent.modes.flatMap((mode) => mode.config.skillIds))],
    },
  };
}

export function getCapabilityToolNames(capability: RuntimeCapability): string[] {
  return capability.tools.map((tool) => tool.name);
}

export function normalizeAllowedToolNames(
  nextAllowed: string[],
  modeConfig: AgentModeConfig,
  internalTools: RuntimeCapability[],
  mcps: RuntimeCapability[],
): string[] {
  const activeCapabilityIds = new Set([...modeConfig.toolIds, ...modeConfig.mcpIds]);
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
