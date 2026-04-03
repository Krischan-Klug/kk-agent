import type { UnifiedToolDefinition } from "../provider/lib/types.js";
import type { AccessScope, McpServerConfig, McpToolDefinition, ToolCallResult, UpdateMcpBody } from "../mcp/types.js";
import { buildSystemMcps, createOverrideState, loadSystemMcpOverrides, saveSystemMcpOverrides } from "./lib/system-registry.js";
import { executeSystemTool, getSystemToolsForMcp } from "./lib/index.js";
import { clearSessionFacts, getMemoryPromptContext, initMemoryState, listSessionFacts, listUserFacts, replaceSessionFacts, replaceUserFacts } from "./lib/memory-state.js";
import { clearTasks, createTasks, getTaskSummary, listTasks, replaceTasks, solveTasks, updateTasks } from "./lib/task-state.js";
import type { MemoryFact, TaskItem, ToolResultOptions } from "./types.js";
import {
  getDefaultPathForScope,
  getTerminalElevationLabel,
  resolveAccessScope,
  resolveFilesystemSystemConfig,
  resolveTerminalSystemConfig,
} from "./lib/access-paths.js";

let cachedSystemMcps: McpServerConfig[] = [];

export interface ResolvedSystemToolTarget {
  toolId: string;
  accessScope?: AccessScope;
}

export interface ResolvedSystemToolRuntime {
  toolDefinitions: UnifiedToolDefinition[];
  instructionsById: Record<string, string>;
  toolTargetsByName: Record<string, ResolvedSystemToolTarget>;
  runtimeVariables: Record<string, string>;
}

function normalizeSystemConfigForMcp(id: string, systemConfig?: McpServerConfig["systemConfig"]) {
  if (id === "filesystem") return resolveFilesystemSystemConfig(systemConfig);
  if (id === "terminal") return resolveTerminalSystemConfig(systemConfig);
  return systemConfig ? { ...systemConfig } : undefined;
}

function buildRuntimeVariablesForMcp(mcp: McpServerConfig): Record<string, string> {
  if (mcp.systemKey === "filesystem") {
    const config = resolveFilesystemSystemConfig(mcp.systemConfig);
    const allowedRoot = getDefaultPathForScope(resolveAccessScope(config.accessScope));
    return {
      FILESYSTEM_ACCESS_SCOPE: resolveAccessScope(config.accessScope),
      FILESYSTEM_BASE_PATH: config.basePath ?? getDefaultPathForScope(resolveAccessScope(config.accessScope)),
      FILESYSTEM_ALLOWED_ROOT: allowedRoot,
    };
  }

  if (mcp.systemKey === "terminal") {
    const config = resolveTerminalSystemConfig(mcp.systemConfig);
    const allowedRoot = getDefaultPathForScope(resolveAccessScope(config.accessScope));
    return {
      TERMINAL_ACCESS_SCOPE: resolveAccessScope(config.accessScope),
      TERMINAL_WORKING_DIRECTORY: config.workingDirectory ?? getDefaultPathForScope(resolveAccessScope(config.accessScope)),
      TERMINAL_ALLOWED_ROOT: allowedRoot,
      TERMINAL_ELEVATION: getTerminalElevationLabel(config.accessScope),
    };
  }

  return {};
}

function setSystemMcp(mcp: McpServerConfig): void {
  cachedSystemMcps = cachedSystemMcps.map((entry) => (entry.id === mcp.id ? mcp : entry));
}

async function persistSystemOverrides(): Promise<void> {
  await saveSystemMcpOverrides(createOverrideState(cachedSystemMcps));
}

function normalizeToolResultForContext(content: string, options: ToolResultOptions = {}): string {
  const maxChars = options.maxContextChars ?? 1200;
  const normalized = content.trim();
  if (normalized.length <= maxChars) return normalized;

  const preview = normalized.slice(0, maxChars);
  return `${preview}\n\n[Ausgabe gekuerzt: ${normalized.length} Zeichen insgesamt]`;
}

function resolveSystemMcp(
  id: string,
  accessScopeOverride?: AccessScope,
  instructionOverride?: string,
): { mcp: McpServerConfig; instruction: string; tools: McpToolDefinition[]; accessContext?: string } | null {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) return null;

  const mcp: McpServerConfig = {
    ...systemMcp,
    systemConfig: normalizeSystemConfigForMcp(id, {
      ...systemMcp.systemConfig,
      ...(accessScopeOverride ? { accessScope: accessScopeOverride } : {}),
    }),
  };

  return {
    mcp,
    instruction: instructionOverride ?? mcp.instruction,
    tools: getSystemToolsForMcp(id),
  };
}

export async function initToolsService(): Promise<void> {
  cachedSystemMcps = buildSystemMcps(await loadSystemMcpOverrides());
  await initMemoryState();
}

export function getAllSystemMcps(): McpServerConfig[] {
  return [...cachedSystemMcps];
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

export function getInternalToolState(sessionId: string): { tasks: TaskItem[]; sessionFacts: MemoryFact[]; userFacts: MemoryFact[] } {
  return {
    tasks: listTasks(sessionId),
    sessionFacts: listSessionFacts(sessionId),
    userFacts: listUserFacts(),
  };
}

export function normalizeToolResult(
  result: ToolCallResult,
  options: ToolResultOptions = {},
): ToolCallResult & { contextContent: string } {
  return {
    ...result,
    contextContent: normalizeToolResultForContext(result.content, options),
  };
}

export function getSystemToolsForId(id: string): McpToolDefinition[] {
  return getSystemToolsForMcp(id);
}

export function listInternalTools(): McpServerConfig[] {
  return getAllSystemMcps();
}

export function getInternalToolById(id: string): McpServerConfig | undefined {
  return getSystemMcpById(id);
}

export function buildResolvedSystemToolRuntime(
  activeToolIds: string[],
  accessScopeOverrides: Record<string, AccessScope> = {},
  instructionOverrides: Record<string, string> = {},
): ResolvedSystemToolRuntime {
  const toolDefinitions: UnifiedToolDefinition[] = [];
  const instructionsById: Record<string, string> = {};
  const toolTargetsByName: Record<string, ResolvedSystemToolTarget> = {};
  const runtimeVariables: Record<string, string> = {};

  for (const toolId of activeToolIds) {
    const resolved = resolveSystemMcp(toolId, accessScopeOverrides[toolId], instructionOverrides[toolId]);
    if (!resolved || !resolved.mcp.active) continue;

    instructionsById[toolId] = resolved.instruction;
    Object.assign(runtimeVariables, buildRuntimeVariablesForMcp(resolved.mcp));

    for (const tool of resolved.tools) {
      toolDefinitions.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      });
      toolTargetsByName[tool.name] = {
        toolId,
        accessScope: accessScopeOverrides[toolId],
      };
    }
  }

  return {
    toolDefinitions,
    instructionsById,
    toolTargetsByName,
    runtimeVariables,
  };
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
    systemConfig: normalizeSystemConfigForMcp(id, {
      ...systemMcp.systemConfig,
      ...body.systemConfig,
    }),
  };

  if (body.name !== undefined) next.name = body.name;
  if (body.emoji !== undefined) next.emoji = body.emoji;

  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
}

export async function startInternalTool(id: string): Promise<McpServerConfig> {
  return toggleSystemMcp(id, true);
}

export async function stopInternalTool(id: string): Promise<McpServerConfig> {
  return toggleSystemMcp(id, false);
}

export async function updateInternalToolInstruction(id: string, instruction: string): Promise<McpServerConfig> {
  return updateSystemMcpConfig(id, { instruction });
}

export async function updateInternalToolConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
  return updateSystemMcpConfig(id, body);
}

export async function executeSystemToolForId(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  accessScopeOverride?: AccessScope,
): Promise<ToolCallResult | null> {
  const resolved = resolveSystemMcp(id, accessScopeOverride);
  if (!resolved || !resolved.mcp.active) return null;
  const result = await executeSystemTool(resolved.mcp, toolName, args);
  return result ? normalizeToolResult(result) : null;
}

export {
  clearSessionFacts,
  clearTasks,
  createTasks,
  getMemoryPromptContext,
  getTaskSummary,
  listSessionFacts,
  listTasks,
  listUserFacts,
  replaceSessionFacts,
  replaceTasks,
  replaceUserFacts,
  solveTasks,
  updateTasks,
};
