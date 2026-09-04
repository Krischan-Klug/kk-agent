import { existsSync } from "node:fs";
import type { McpServerConfig } from "../types.js";
import { INTERNAL_TOOL_IDS } from "../../tools/types.js";
import { listManagedMcpManifests } from "../../tools/lib/managed-mcp/registry.js";
import { getStatePath, readJsonFile, writeJsonFile } from "../../lib/state.js";

const REGISTRY_PATH = getStatePath("mcps.json");
const RESERVED_IDS = new Set<string>([
  ...INTERNAL_TOOL_IDS,
  ...listManagedMcpManifests().map((manifest) => manifest.id),
]);
const DEFAULT_REGISTRY: { mcps: McpServerConfig[] } = { mcps: [] };

function normalizeStoredMcp(mcp: McpServerConfig): McpServerConfig {
  return {
    id: mcp.id,
    name: mcp.name,
    active: mcp.active,
    instruction: mcp.instruction,
    ...(mcp.emoji ? { emoji: mcp.emoji } : {}),
    transport: mcp.transport,
    server: mcp.server,
    ...(mcp.credentialBindings?.length ? { credentialBindings: mcp.credentialBindings } : {}),
    ...(mcp.allowedTools?.length ? { allowedTools: mcp.allowedTools } : {}),
    ...(mcp.connectTimeoutMs ? { connectTimeoutMs: mcp.connectTimeoutMs } : {}),
  };
}

async function loadRegistry(): Promise<McpServerConfig[]> {
  if (!existsSync(REGISTRY_PATH)) {
    await writeJsonFile(REGISTRY_PATH, DEFAULT_REGISTRY);
    return DEFAULT_REGISTRY.mcps;
  }
  const data = await readJsonFile<{ mcps?: McpServerConfig[] }>(REGISTRY_PATH);
  const mcps = (data?.mcps ?? [])
    .filter((mcp) => !RESERVED_IDS.has(mcp.id))
    .map(normalizeStoredMcp);
  await saveRegistry(mcps);
  return mcps;
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
