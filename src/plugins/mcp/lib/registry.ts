import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { McpServerConfig } from "../types.js";
import { getStatePath } from "../../lib/state.js";

const REGISTRY_PATH = getStatePath("mcps.json");
const LEGACY_PATH = resolve("mcps.json");
const SYSTEM_IDS = new Set(["filesystem", "web-search", "terminal", "commands"]);
const DEFAULT_REGISTRY: { mcps: McpServerConfig[] } = { mcps: [] };

async function ensureDir(): Promise<void> {
  const dir = dirname(REGISTRY_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function migrateFromRoot(): Promise<boolean> {
  if (existsSync(LEGACY_PATH) && !existsSync(REGISTRY_PATH)) {
    await ensureDir();
    await rename(LEGACY_PATH, REGISTRY_PATH);
    console.log("[mcp] Migrated mcps.json from root to state/mcps.json");
    return true;
  }
  return false;
}

export async function loadRegistry(): Promise<McpServerConfig[]> {
  await migrateFromRoot();

  if (!existsSync(REGISTRY_PATH)) {
    await ensureDir();
    await writeFile(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2), "utf-8");
    return DEFAULT_REGISTRY.mcps;
  }
  const raw = await readFile(REGISTRY_PATH, "utf-8");
  const data = JSON.parse(raw) as { mcps: McpServerConfig[] };
  return (data.mcps ?? [])
    .filter((mcp) => !SYSTEM_IDS.has(mcp.id))
    .map((mcp) => ({ ...mcp, source: "custom" as const }));
}

export async function saveRegistry(mcps: McpServerConfig[]): Promise<void> {
  await ensureDir();
  await writeFile(REGISTRY_PATH, JSON.stringify({ mcps }, null, 2), "utf-8");
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
