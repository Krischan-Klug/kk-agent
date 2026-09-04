import type { McpHttpConfig, McpServerConfig, McpStdioConfig, McpToolDefinition, CreateMcpBody, UpdateMcpBody } from "./types.js";
import { getInternalTool } from "../tools/service.js";
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
import { validateMcpConfig } from "./lib/config.js";

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

  if (getInternalTool(id)) throw new ConflictError(`MCP id "${id}" is reserved by an internal tool`);
  const existing = await getRegistry();
  if (getMcpById(existing, id)) throw new ConflictError(`MCP "${id}" already exists`);

  const config: McpServerConfig = {
    id,
    name: body.name,
    active: false,
    instruction: body.instruction ?? "",
    emoji: body.emoji,
    transport: body.transport,
    ...(body.credentialBindings?.length ? { credentialBindings: body.credentialBindings } : {}),
    server:
      body.transport === "stdio"
        ? { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) }
        : { url: body.url ?? "", ...(body.headers && { headers: body.headers }) },
  };

  validateMcpConfig(config);

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
  if (body.credentialBindings !== undefined) {
    next.credentialBindings = body.credentialBindings.length > 0 ? body.credentialBindings : undefined;
  }

  if (body.transport !== undefined) {
    next.transport = body.transport;
    next.server = body.transport === "stdio"
      ? { command: body.command ?? "", args: body.args ?? [], ...(body.env && { env: body.env }) }
      : { url: body.url ?? "", ...(body.headers && { headers: body.headers }) };
  } else if (next.transport === "stdio") {
    const server = next.server as McpStdioConfig;
    if (body.command !== undefined) server.command = body.command;
    if (body.args !== undefined) server.args = body.args;
    if (body.env !== undefined) server.env = Object.keys(body.env).length > 0 ? body.env : undefined;
  } else {
    const server = next.server as McpHttpConfig;
    if (body.url !== undefined) server.url = body.url;
    if (body.headers !== undefined) server.headers = Object.keys(body.headers).length > 0 ? body.headers : undefined;
  }

  const connectionChanged = current.transport !== next.transport
    || JSON.stringify(current.server) !== JSON.stringify(next.server);
  const credentialsChanged = JSON.stringify(current.credentialBindings) !== JSON.stringify(next.credentialBindings);
  validateMcpConfig(next);
  const index = mcps.findIndex((mcp) => mcp.id === id);
  mcps[index] = next;
  await updateRegistry(mcps);
  cachedCustomMcps = mcps;

  if (!next.active) {
    await stopMcp(id);
  } else if (!current.active || connectionChanged || credentialsChanged) {
    if (connectionChanged || credentialsChanged) await stopMcp(id);
    await startMcp(next);
  }

  return next;
}

export async function refreshActiveMcps(changedCredentialIds?: ReadonlySet<string>): Promise<void> {
  for (const mcp of cachedCustomMcps) {
    if (!mcp.active) continue;
    if (changedCredentialIds && !(mcp.credentialBindings ?? []).some((binding) => changedCredentialIds.has(binding.credentialId))) continue;
    await stopMcp(mcp.id);
    await startMcp(mcp);
  }
}

export async function executeToolForMcp(
  mcpId: string,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ content: string; isError: boolean }> {
  return executeMcpTool(mcpId, toolName, args, signal);
}
