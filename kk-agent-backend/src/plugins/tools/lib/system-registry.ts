import { loadState, saveState } from "../../lib/state.js";
import type { McpServerConfig, SystemMcpConfig, SystemMcpKey } from "../../mcp/types.js";
import { getDefaultSystemMcpMap } from "./index.js";
import { normalizeSystemConfig } from "./system-config.js";

interface SystemMcpOverrideEntry {
  active?: boolean;
  instruction?: string;
  systemConfig?: SystemMcpConfig;
}

interface SystemMcpOverrideState {
  mcps: Partial<Record<SystemMcpKey, SystemMcpOverrideEntry>>;
}

const OVERRIDES_FILE = "system-mcps.json";
const DEFAULT_OVERRIDES: SystemMcpOverrideState = { mcps: {} };

export async function loadSystemMcpOverrides(): Promise<SystemMcpOverrideState> {
  return loadState<SystemMcpOverrideState>(OVERRIDES_FILE, DEFAULT_OVERRIDES);
}

export async function saveSystemMcpOverrides(state: SystemMcpOverrideState): Promise<void> {
  await saveState(OVERRIDES_FILE, state);
}

export function buildSystemMcps(overrides: SystemMcpOverrideState): McpServerConfig[] {
  const defaultSystemMcps = getDefaultSystemMcpMap();

  return (Object.keys(defaultSystemMcps) as SystemMcpKey[]).map((key) => {
    const base = defaultSystemMcps[key];
    const override = overrides.mcps[key];
    const mergedSystemConfig = normalizeSystemConfig(key, {
      ...base.systemConfig,
      ...override?.systemConfig,
    });

    return {
      ...base,
      active: override?.active ?? base.active,
      instruction: override?.instruction ?? base.instruction,
      systemConfig: mergedSystemConfig,
    };
  });
}

export function createOverrideState(mcps: McpServerConfig[]): SystemMcpOverrideState {
  const state: SystemMcpOverrideState = { mcps: {} };
  const defaults = getDefaultSystemMcpMap();
  for (const mcp of mcps) {
    if (mcp.source !== "system" || !mcp.systemKey) continue;
    const base = defaults[mcp.systemKey];
    const normalizedConfig = normalizeSystemConfig(mcp.systemKey, mcp.systemConfig);
    const baseConfig = normalizeSystemConfig(mcp.systemKey, base.systemConfig);
    const entry: SystemMcpOverrideEntry = {};
    if (mcp.active !== base.active) entry.active = mcp.active;
    if (mcp.instruction !== base.instruction) entry.instruction = mcp.instruction;
    if (JSON.stringify(normalizedConfig) !== JSON.stringify(baseConfig)) entry.systemConfig = normalizedConfig;
    if (Object.keys(entry).length > 0) state.mcps[mcp.systemKey] = entry;
  }
  return state;
}
