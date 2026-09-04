import { loadState, saveState } from "../../lib/state.js";
import type { InternalToolConfig, InternalToolDefinition } from "../types.js";
import { getDefaultInternalToolMap } from "./tool-modules.js";
import { normalizeInternalToolConfig } from "./internal-tool-config.js";
import { buildManagedInternalToolDefinitions } from "./managed-mcp/registry.js";

interface InternalToolOverride {
  active?: boolean;
  instruction?: string;
  config?: InternalToolConfig;
}

interface InternalToolOverrideState {
  tools: Record<string, InternalToolOverride>;
}

const OVERRIDES_FILE = "internal-tools.json";
const DEFAULT_OVERRIDES: InternalToolOverrideState = { tools: {} };

export async function loadInternalToolOverrides(): Promise<InternalToolOverrideState> {
  return loadState<InternalToolOverrideState>(OVERRIDES_FILE, DEFAULT_OVERRIDES);
}

export async function saveInternalToolOverrides(state: InternalToolOverrideState): Promise<void> {
  await saveState(OVERRIDES_FILE, state);
}

export function buildInternalTools(overrides: InternalToolOverrideState): InternalToolDefinition[] {
  const defaults = getAllDefaultInternalToolMap();

  return Object.keys(defaults).map((id) => {
    const base = defaults[id];
    const override = overrides.tools[id];
    const config = normalizeInternalToolConfig({
      ...base.config,
      ...override?.config,
    });

    return {
      ...base,
      active: override?.active ?? base.active,
      instruction: override?.instruction ?? base.instruction,
      config,
    };
  });
}

export function createOverrideState(tools: InternalToolDefinition[]): InternalToolOverrideState {
  const state: InternalToolOverrideState = { tools: {} };
  const defaults = getAllDefaultInternalToolMap();
  for (const tool of tools) {
    const base = defaults[tool.id];
    const config = normalizeInternalToolConfig(tool.config);
    const baseConfig = normalizeInternalToolConfig(base.config);
    const entry: InternalToolOverride = {};
    if (tool.active !== base.active) entry.active = tool.active;
    if (tool.instruction !== base.instruction) entry.instruction = tool.instruction;
    if (JSON.stringify(config) !== JSON.stringify(baseConfig)) entry.config = config;
    if (Object.keys(entry).length > 0) state.tools[tool.id] = entry;
  }
  return state;
}

export function getAllDefaultInternalToolMap(): Record<string, InternalToolDefinition> {
  return Object.fromEntries([
    ...Object.entries(getDefaultInternalToolMap()),
    ...buildManagedInternalToolDefinitions().map((tool) => [tool.id, tool] as const),
  ]);
}
