import type { McpServerConfig, McpStdioConfig, McpToolDefinition, CreateMcpBody, UpdateMcpBody } from "./types.js";
import type { UnifiedToolDefinition } from "../provider/lib/types.js";
import { getRegistry, updateRegistry, getMcpById, addMcp, removeMcp } from "./lib/registry.js";
import {
  startMcp,
  stopMcp,
  getToolsForMcp,
  getAllTools,
  executeTool,
  getRunningMcps,
} from "./lib/process-manager.js";

// Cached registry for sync access
let cachedMcps: McpServerConfig[] = [];

export async function initMcpService(): Promise<void> {
  cachedMcps = await getRegistry();
}

export async function refreshCache(): Promise<void> {
  cachedMcps = await getRegistry();
}

export async function getAllMcps(): Promise<McpServerConfig[]> {
  return getRegistry();
}

export async function toggleMcp(id: string, active: boolean): Promise<McpServerConfig> {
  const mcps = await getRegistry();
  const mcp = getMcpById(mcps, id);
  if (!mcp) throw new Error(`MCP "${id}" not found`);

  mcp.active = active;
  await updateRegistry(mcps);

  if (active) {
    await startMcp(mcp);
  } else {
    await stopMcp(id);
  }

  cachedMcps = mcps;
  return mcp;
}

export async function updateInstruction(id: string, instruction: string): Promise<McpServerConfig> {
  const mcps = await getRegistry();
  const mcp = getMcpById(mcps, id);
  if (!mcp) throw new Error(`MCP "${id}" not found`);

  mcp.instruction = instruction;
  await updateRegistry(mcps);
  cachedMcps = mcps;
  return mcp;
}

export function getActiveInstructions(): { id: string; name: string; instruction: string }[] {
  const runningIds = new Set(getRunningMcps());
  return cachedMcps
    .filter((m) => m.active && runningIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, instruction: m.instruction }));
}

export function getKnownMcpIds(): string[] {
  return cachedMcps.map((m) => m.id);
}

export function getRunnableMcpIds(): string[] {
  const runningIds = new Set(getRunningMcps());
  return cachedMcps.filter((m) => m.active && runningIds.has(m.id)).map((m) => m.id);
}

export function getToolDefinitions(activeMcpIds: string[]): UnifiedToolDefinition[] {
  return getAllTools(activeMcpIds).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}

export function getMcpTools(id: string): McpToolDefinition[] {
  return getToolsForMcp(id);
}

export async function startMcpServer(id: string): Promise<void> {
  const mcps = await getRegistry();
  const mcp = getMcpById(mcps, id);
  if (!mcp) throw new Error(`MCP "${id}" not found`);
  await startMcp(mcp);
  mcp.active = true;
  await updateRegistry(mcps);
  cachedMcps = mcps;
}

export async function stopMcpServer(id: string): Promise<void> {
  await stopMcp(id);
  const mcps = await getRegistry();
  const mcp = getMcpById(mcps, id);
  if (!mcp) throw new Error(`MCP "${id}" not found`);
  mcp.active = false;
  await updateRegistry(mcps);
  cachedMcps = mcps;
}

export async function createMcp(body: CreateMcpBody): Promise<McpServerConfig> {
  const id = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const existing = await getRegistry();
  if (getMcpById(existing, id)) throw new Error(`MCP "${id}" already exists`);

  const config: McpServerConfig = {
    id,
    name: body.name,
    active: false,
    instruction: body.instruction ?? "",
    transport: body.transport,
    server:
      body.transport === "stdio"
        ? { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) }
        : { url: body.url ?? "" },
  };

  await addMcp(config);
  cachedMcps = await getRegistry();
  return config;
}

export async function deleteMcp(id: string): Promise<void> {
  try {
    await stopMcp(id);
  } catch {
    // not running — fine
  }
  const removed = await removeMcp(id);
  if (!removed) throw new Error(`MCP "${id}" not found`);
  cachedMcps = await getRegistry();
}

export async function updateMcpConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
  const mcps = await getRegistry();
  const mcp = getMcpById(mcps, id);
  if (!mcp) throw new Error(`MCP "${id}" not found`);

  if (body.name !== undefined) mcp.name = body.name;
  if (body.instruction !== undefined) mcp.instruction = body.instruction;

  if (body.transport !== undefined) {
    mcp.transport = body.transport;
    if (body.transport === "stdio") {
      mcp.server = { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) };
    } else {
      mcp.server = { url: body.url ?? "" };
    }
  } else if (mcp.transport === "stdio") {
    const s = mcp.server as McpStdioConfig;
    if (body.command !== undefined) s.command = body.command;
    if (body.args !== undefined) s.args = body.args;
    if (body.env !== undefined) s.env = Object.keys(body.env).length > 0 ? body.env : undefined;
  } else {
    const s = mcp.server as { url: string };
    if (body.url !== undefined) s.url = body.url;
  }

  await updateRegistry(mcps);
  cachedMcps = mcps;
  return mcp;
}

export { executeTool, getAllTools };
