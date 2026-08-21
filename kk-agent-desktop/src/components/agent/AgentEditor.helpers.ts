import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeDefinition,
  AppDefaults,
  McpListItem,
  ModeBehavior,
} from "@/types/api";
export { PROMPT_SECTION_META } from "@/lib/promptSections";

export const MODE_BEHAVIORS: ModeBehavior[] = ["plan", "edit"];

export const OVERRIDE_EMOJI = "\u270F\uFE0F";
export const RESET_EMOJI = "\u21BA";

type ConcreteCapabilityTool = {
  capabilityId: string;
  capabilityName: string;
  name: string;
  description: string;
};

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

function getConcreteCapabilityTools(capabilityIds: string[], capabilities: McpListItem[]): ConcreteCapabilityTool[] {
  const capabilityMap = new Map(capabilities.map((entry) => [entry.id, entry]));
  return capabilityIds
    .map((id) => capabilityMap.get(id))
    .filter((entry): entry is McpListItem => Boolean(entry))
    .flatMap((entry) => entry.tools.map((tool) => ({
      capabilityId: entry.id,
      capabilityName: entry.name,
      name: tool.name,
      description: tool.description,
    })));
}

function getConcreteInternalTools(modeConfig: AgentModeConfig, internalTools: McpListItem[]) {
  return getConcreteCapabilityTools(modeConfig.toolIds, internalTools);
}

function getConcreteMcpTools(modeConfig: AgentModeConfig, mcps: McpListItem[]) {
  return getConcreteCapabilityTools(modeConfig.mcpIds, mcps);
}

export function getConcreteRuntimeTools(modeConfig: AgentModeConfig, internalTools: McpListItem[], mcps: McpListItem[]) {
  return [
    ...getConcreteInternalTools(modeConfig, internalTools),
    ...getConcreteMcpTools(modeConfig, mcps),
  ];
}

export function getCapabilityToolNames(capability: McpListItem): string[] {
  return capability.tools.map((tool) => tool.name);
}

export function normalizeAllowedToolNames(nextAllowed: string[], concreteTools: Array<{ name: string }>): string[] {
  const activeToolNames = new Set(concreteTools.map((tool) => tool.name));
  return [...new Set(nextAllowed)].filter((name) => activeToolNames.has(name));
}

export function hasAllowedToolForCapability(allowedToolNames: string[], capabilityToolNames: string[]): boolean {
  return capabilityToolNames.some((toolName) => allowedToolNames.includes(toolName));
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
