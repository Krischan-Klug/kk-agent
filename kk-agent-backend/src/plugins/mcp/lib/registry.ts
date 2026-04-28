import { existsSync } from "node:fs";
import type { McpServerConfig } from "../types.js";
import { SYSTEM_MCP_KEYS } from "../types.js";
import { getStatePath, readJsonFile, writeJsonFile } from "../../lib/state.js";

const REGISTRY_PATH = getStatePath("mcps.json");
const SYSTEM_IDS = new Set<string>(SYSTEM_MCP_KEYS);
const DEFAULT_REGISTRY: { mcps: McpServerConfig[] } = { mcps: [] };

async function loadRegistry(): Promise<McpServerConfig[]> {
  if (!existsSync(REGISTRY_PATH)) {
    await writeJsonFile(REGISTRY_PATH, DEFAULT_REGISTRY);
    return DEFAULT_REGISTRY.mcps;
  }
  const data = await readJsonFile<{ mcps: McpServerConfig[] }>(REGISTRY_PATH);
  return (data?.mcps ?? [])
    .filter((mcp) => !SYSTEM_IDS.has(mcp.id))
    .map((mcp) => ({ ...mcp, source: "custom" as const }));
}

async function saveRegistry(mcps: McpServerConfig[]): Promise<void> {
  await writeJsonFile(REGISTRY_PATH, { mcps });
}

let cachedRegistry: McpServerConfig[] | null = null;

export async function getRegistry(): Promise<McpServerConfig[]> {
  if (!cachedRegistry) cachedRegistry = await loadRegistry();
  return cachedRegistry;
}

export async function updateRegistry(mcps: McpServerConfig[]): Promise<void> {
  cachedRegistry = mcps;
  await saveRegistry(mcps);
}

export function getMcpById(mcps: McpServerConfig[], id: string): McpServerConfig | undefined {
  return mcps.find((m) => m.id === id);
}

export async function addMcp(config: McpServerConfig): Promise<void> {
  const mcps = await getRegistry();
  mcps.push(config);
  await updateRegistry(mcps);
}

export async function removeMcp(id: string): Promise<boolean> {
  const mcps = await getRegistry();
  const idx = mcps.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  mcps.splice(idx, 1);
  await updateRegistry(mcps);
  return true;
}
