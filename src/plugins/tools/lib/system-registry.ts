import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { getStatePath, loadState, saveState } from "../../lib/state.js";
import type { McpServerConfig, SystemMcpConfig, SystemMcpKey } from "../../mcp/types.js";
import { getDefaultSystemMcpMap } from "./index.js";

interface SystemMcpOverrideEntry {
  active?: boolean;
  instruction?: string;
  systemConfig?: SystemMcpConfig;
}

interface SystemMcpOverrideState {
  mcps: Partial<Record<SystemMcpKey, SystemMcpOverrideEntry>>;
}

const OVERRIDES_FILE = "system-mcps.json";
const LEGACY_MCP_IDS = new Set(["filesystem", "web-search", "terminal", "commands"]);
const DEFAULT_OVERRIDES: SystemMcpOverrideState = { mcps: {} };

function normalizeLegacySystemKey(id: string): SystemMcpKey | null {
  if (id === "commands") return "terminal";
  if (id === "filesystem" || id === "web-search" || id === "terminal") return id;
  return null;
}

async function loadLegacyOverrides(): Promise<SystemMcpOverrideState> {
  const path = getStatePath("mcps.json");
  if (!existsSync(path)) return DEFAULT_OVERRIDES;

  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as { mcps?: McpServerConfig[] };
    const result: SystemMcpOverrideState = { mcps: {} };

    for (const mcp of parsed.mcps ?? []) {
      if (!LEGACY_MCP_IDS.has(mcp.id)) continue;
      const key = normalizeLegacySystemKey(mcp.id);
      if (!key) continue;

      const entry: SystemMcpOverrideEntry = {
        active: mcp.active,
        instruction: mcp.instruction,
      };

      if (key === "filesystem") {
        const server = "command" in mcp.server ? mcp.server : null;
        const rootPath = server?.args?.at(-1) ?? homedir();
        entry.systemConfig = { rootPath };
      }

      if (key === "terminal") {
        const server = "command" in mcp.server ? mcp.server : null;
        const workingDirectory = server?.env?.WORKING_DIRECTORY ?? homedir();
        entry.systemConfig = { workingDirectory };
      }

      result.mcps[key] = entry;
    }

    return result;
  } catch {
    return DEFAULT_OVERRIDES;
  }
}

export async function loadSystemMcpOverrides(): Promise<SystemMcpOverrideState> {
  const state = await loadState<SystemMcpOverrideState>(OVERRIDES_FILE, DEFAULT_OVERRIDES);
  const hasOverrides = Object.keys(state.mcps ?? {}).length > 0;
  if (hasOverrides) return state;

  const migrated = await loadLegacyOverrides();
  if (Object.keys(migrated.mcps).length > 0) {
    await saveState(OVERRIDES_FILE, migrated);
    return migrated;
  }
  return state;
}

export async function saveSystemMcpOverrides(state: SystemMcpOverrideState): Promise<void> {
  await saveState(OVERRIDES_FILE, state);
}

export function buildSystemMcps(overrides: SystemMcpOverrideState): McpServerConfig[] {
  const defaultSystemMcps = getDefaultSystemMcpMap();

  return (Object.keys(defaultSystemMcps) as SystemMcpKey[]).map((key) => {
    const base = defaultSystemMcps[key];
    const override = overrides.mcps[key];
    if (!override) return base;

    return {
      ...base,
      active: override.active ?? base.active,
      instruction: override.instruction ?? base.instruction,
      systemConfig: {
        ...base.systemConfig,
        ...override.systemConfig,
      },
    };
  });
}

export function createOverrideState(mcps: McpServerConfig[]): SystemMcpOverrideState {
  const state: SystemMcpOverrideState = { mcps: {} };
  for (const mcp of mcps) {
    if (mcp.source !== "system" || !mcp.systemKey) continue;
    state.mcps[mcp.systemKey] = {
      active: mcp.active,
      instruction: mcp.instruction,
      systemConfig: mcp.systemConfig ? { ...mcp.systemConfig } : undefined,
    };
  }
  return state;
}
