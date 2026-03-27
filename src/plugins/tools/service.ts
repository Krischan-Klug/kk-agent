import type { UnifiedToolDefinition } from "../provider/lib/types.js";
import type { McpServerConfig, McpToolDefinition, ToolCallResult, UpdateMcpBody } from "../mcp/types.js";
import { buildSystemMcps, createOverrideState, loadSystemMcpOverrides, saveSystemMcpOverrides } from "./lib/system-registry.js";
import { executeSystemTool, getSystemToolDefinitions, getSystemToolsForMcp } from "./lib/index.js";

let cachedSystemMcps: McpServerConfig[] = [];

function setSystemMcp(mcp: McpServerConfig): void {
  cachedSystemMcps = cachedSystemMcps.map((entry) => (entry.id === mcp.id ? mcp : entry));
}

async function persistSystemOverrides(): Promise<void> {
  await saveSystemMcpOverrides(createOverrideState(cachedSystemMcps));
}

export async function initToolsService(): Promise<void> {
  cachedSystemMcps = buildSystemMcps(await loadSystemMcpOverrides());
}

export function getAllSystemMcps(): McpServerConfig[] {
  return cachedSystemMcps;
}

export function getSystemMcpById(id: string): McpServerConfig | undefined {
  return cachedSystemMcps.find((mcp) => mcp.id === id);
}

export function getKnownSystemMcpIds(): string[] {
  return cachedSystemMcps.map((mcp) => mcp.id);
}

export function getRunnableSystemMcpIds(): string[] {
  return cachedSystemMcps.filter((mcp) => mcp.active).map((mcp) => mcp.id);
}

export function getActiveToolInstructions(): { id: string; name: string; instruction: string }[] {
  return cachedSystemMcps
    .filter((mcp) => mcp.active)
    .map((mcp) => ({ id: mcp.id, name: mcp.name, instruction: mcp.instruction }));
}

export function getSystemToolDefinitionsForActive(activeMcpIds: string[]): UnifiedToolDefinition[] {
  return getSystemToolDefinitions(activeMcpIds).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

export function getSystemToolsForId(id: string): McpToolDefinition[] {
  return getSystemToolsForMcp(id);
}

export async function toggleSystemMcp(id: string, active: boolean): Promise<McpServerConfig> {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) throw new Error(`System-MCP "${id}" not found`);
  const next = { ...systemMcp, active };
  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
}

export async function updateSystemMcpConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) throw new Error(`System-MCP "${id}" not found`);

  const next: McpServerConfig = {
    ...systemMcp,
    active: body.active ?? systemMcp.active,
    instruction: body.instruction ?? systemMcp.instruction,
    systemConfig: {
      ...systemMcp.systemConfig,
      ...body.systemConfig,
    },
  };

  if (body.name !== undefined) next.name = body.name;
  if (body.emoji !== undefined) next.emoji = body.emoji;

  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
}

export async function executeSystemToolByName(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  for (const mcp of cachedSystemMcps) {
    if (!mcp.active) continue;
    const result = await executeSystemTool(mcp, toolName, args);
    if (result) return result;
  }
  return null;
}
