import { loadState, saveState } from "../../lib/state.js";
import type { InternalToolConfig, InternalToolDefinition, InternalToolId } from "../types.js";
import { getDefaultInternalToolMap } from "./tool-modules.js";
import { normalizeInternalToolConfig } from "./internal-tool-config.js";

interface InternalToolOverride {
  active?: boolean;
  instruction?: string;
  config?: InternalToolConfig;
}

interface InternalToolOverrideState {
  tools: Partial<Record<InternalToolId, InternalToolOverride>>;
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
  const defaults = getDefaultInternalToolMap();

  return (Object.keys(defaults) as InternalToolId[]).map((id) => {
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
  const defaults = getDefaultInternalToolMap();
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
