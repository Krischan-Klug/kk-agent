import type { McpServerConfig, McpSseConfig, McpStdioConfig, McpToolDefinition, CreateMcpBody, UpdateMcpBody } from "./types.js";
import { getSystemMcpById } from "../tools/service.js";
import { createSlugId } from "../lib/ids.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import { getRegistry, updateRegistry, getMcpById, addMcp, removeMcp } from "./lib/registry.js";
import {
  startMcp,
  stopMcp,
  getToolsForMcp,
  executeToolForMcp as executeMcpTool,
  forgetMcpRuntimeState,
  getRunningMcps,
} from "./lib/process-manager.js";

let cachedCustomMcps: McpServerConfig[] = [];

export async function initMcpService(): Promise<void> {
  cachedCustomMcps = await getRegistry();
}

export async function getAllMcps(): Promise<McpServerConfig[]> {
  cachedCustomMcps = await getRegistry();
  return cachedCustomMcps;
}

export function getAllMcpsCached(): McpServerConfig[] {
  return cachedCustomMcps;
}

export function getActiveInstructions(): { id: string; name: string; instruction: string }[] {
  const runningIds = new Set(getRunningMcps());
  return cachedCustomMcps
    .filter((m) => m.active && runningIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, instruction: m.instruction }));
}

export function getKnownMcpIds(): string[] {
  return cachedCustomMcps.map((m) => m.id);
}

export function getRunnableMcpIds(): string[] {
  const runningIds = new Set(getRunningMcps());
  return cachedCustomMcps
    .filter((m) => m.active && runningIds.has(m.id))
    .map((m) => m.id);
}

export function getMcpTools(id: string): McpToolDefinition[] {
  return getToolsForMcp(id);
}

export async function createMcp(body: CreateMcpBody): Promise<McpServerConfig> {
  const id = createSlugId(body.name);

  if (getSystemMcpById(id)) throw new ConflictError(`MCP "${id}" is reserved as a system MCP`);
  const existing = await getRegistry();
  if (getMcpById(existing, id)) throw new ConflictError(`MCP "${id}" already exists`);

  const config: McpServerConfig = {
    id,
    name: body.name,
    active: false,
    instruction: body.instruction ?? "",
    emoji: body.emoji,
    source: "custom",
    transport: body.transport,
    server:
      body.transport === "stdio"
        ? { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) }
        : { url: body.url ?? "" },
  };

  await addMcp(config);
  cachedCustomMcps = await getRegistry();
  return config;
}

export async function deleteMcp(id: string): Promise<void> {
  try {
    await stopMcp(id);
  } catch {
    // not running — fine
  }
  const removed = await removeMcp(id);
  if (!removed) throw new NotFoundError("MCP", id);
  forgetMcpRuntimeState(id);
  cachedCustomMcps = await getRegistry();
}

export async function updateMcpConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
  const mcps = await getRegistry();
  const current = getMcpById(mcps, id);
  if (!current) throw new NotFoundError("MCP", id);

  const next: McpServerConfig = {
    ...current,
    server: structuredClone(current.server),
    active: body.active ?? current.active,
    name: body.name ?? current.name,
    instruction: body.instruction ?? current.instruction,
  };
  if (body.emoji !== undefined) next.emoji = body.emoji;

  if (body.transport !== undefined) {
    next.transport = body.transport;
    next.server = body.transport === "stdio"
      ? { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) }
      : { url: body.url ?? "" };
  } else if (next.transport === "stdio") {
    const server = next.server as McpStdioConfig;
    if (body.command !== undefined) server.command = body.command;
    if (body.args !== undefined) server.args = body.args;
    if (body.env !== undefined) server.env = Object.keys(body.env).length > 0 ? body.env : undefined;
  } else if (body.url !== undefined) {
    (next.server as McpSseConfig).url = body.url;
  }

  const connectionChanged = current.transport !== next.transport
    || JSON.stringify(current.server) !== JSON.stringify(next.server);
  const index = mcps.findIndex((mcp) => mcp.id === id);
  mcps[index] = next;
  await updateRegistry(mcps);
  cachedCustomMcps = mcps;

  if (!next.active) {
    await stopMcp(id);
  } else if (!current.active || connectionChanged) {
    if (connectionChanged) await stopMcp(id);
    await startMcp(next);
  }

  return next;
}

export async function executeToolForMcp(
  mcpId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  return executeMcpTool(mcpId, toolName, args);
}
