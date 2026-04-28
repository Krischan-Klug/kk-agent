import type { RuntimeToolDefinition } from "../loop/types.js";
import type {
  AccessScope,
  McpServerConfig,
  McpToolDefinition,
  SystemMcpKey,
  UpdateMcpBody,
} from "../mcp/types.js";
import { buildSystemMcps, createOverrideState, loadSystemMcpOverrides, saveSystemMcpOverrides } from "./lib/system-registry.js";
import { executeSystemTool, getSystemToolsForMcp } from "./lib/index.js";
import { clearSessionFacts, getMemoryPromptContext, initMemoryState, listSessionFacts, listUserFacts, replaceSessionFacts, replaceUserFacts } from "./lib/memory-state.js";
import { clearTasks, getTaskSummary, listTasks, replaceTasks } from "./lib/task-state.js";
import type { MemoryFact, TaskItem } from "./types.js";
import {
  getDefaultPathForScope,
  getTerminalElevationLabel,
  resolveAccessScope,
  resolveFilesystemSystemConfig,
  resolveTerminalSystemConfig,
} from "./lib/access-paths.js";
import { NotFoundError } from "../../lib/errors.js";
import { getDefaultSystemMcpMap } from "./lib/index.js";
import { normalizeSystemConfig } from "./lib/system-config.js";
import {
  getShellPermissionPrompt,
  isDestructiveShellCommand,
  isReadOnlyShellCommand,
} from "./lib/terminal/command-policy.js";

let cachedSystemMcps: McpServerConfig[] = [];

export interface ResolvedSystemToolRuntime {
  instructionsById: Record<string, string>;
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  runtimeVariables: Record<string, string>;
}

const SELF_BOUNDED_READ_SYSTEM_TOOLS = new Set([
  "Read",
  "read_attachment",
]);

function isConcurrencySafeSystemTool(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === "Bash") {
    return isReadOnlyShellCommand(String(input.command ?? ""));
  }

  return new Set([
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "list_attachments",
    "read_attachment",
    "ask_user",
  ]).has(toolName);
}

function buildSystemToolResultPolicy(mcp: McpServerConfig, toolName: string) {
  // Read-style tools bound their own output. Re-persisting them into tool-results is
  // circular because the model would need the same read tool to inspect that file again.
  return {
    previewThresholdChars: mcp.systemConfig?.resultPolicy?.previewThresholdChars,
    previewChars: mcp.systemConfig?.resultPolicy?.previewChars,
    persistLargeResults: !SELF_BOUNDED_READ_SYSTEM_TOOLS.has(toolName),
    excludeFromContextBudget: SELF_BOUNDED_READ_SYSTEM_TOOLS.has(toolName),
  };
}

function buildSystemToolPermissionPolicy(toolName: string): RuntimeToolDefinition["permissionPolicy"] {
  if (toolName === "Bash") {
    return { kind: "allow" };
  }
  return { kind: "allow" };
}

function buildSystemToolPermissionResolver(toolName: string): RuntimeToolDefinition["resolvePermission"] | undefined {
  if (toolName !== "Bash") return undefined;

  return (_resolvedToolName, args, mode) => {
    const command = String(args.command ?? "").trim();
    if (!command) {
      return { kind: "deny", reason: "Bash requires a command." };
    }
    if (mode.behavior === "plan" && !isReadOnlyShellCommand(command)) {
      return {
        kind: "deny",
        reason: "Im Plan-Mode ist Bash nur fuer read-only Diagnose, Suche und Inspektion erlaubt.",
      };
    }
    if (mode.behavior === "edit" && isDestructiveShellCommand(command)) {
      const prompt = getShellPermissionPrompt(command);
      return {
        kind: "prompt",
        question: prompt.question,
        choices: prompt.choices,
        allowKeys: prompt.allowKeys,
        deniedMessage: prompt.deniedMessage,
      };
    }
    return { kind: "allow" };
  };
}

function normalizeSystemConfigForMcp(id: string, systemConfig?: McpServerConfig["systemConfig"]) {
  const defaults = getDefaultSystemMcpMap();
  const base = id in defaults ? defaults[id as SystemMcpKey] : undefined;
  const baseSystemConfig = base?.systemConfig;
  const explicitResultPolicy = Object.prototype.hasOwnProperty.call(systemConfig ?? {}, "resultPolicy");

  const merged = {
    ...baseSystemConfig,
    ...systemConfig,
    ...(explicitResultPolicy ? { resultPolicy: { ...baseSystemConfig?.resultPolicy, ...systemConfig?.resultPolicy } } : {}),
  };

  return normalizeSystemConfig(id as SystemMcpKey, merged);
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



export function buildResolvedSystemToolRuntime(
  activeToolIds: string[],
  accessScopeOverrides: Record<string, AccessScope> = {},
  instructionOverrides: Record<string, string> = {},
): ResolvedSystemToolRuntime {
  const instructionsById: Record<string, string> = {};
  const runtimeToolsByName: Record<string, RuntimeToolDefinition> = {};
  const runtimeVariables: Record<string, string> = {};

  for (const toolId of activeToolIds) {
    const resolved = resolveSystemMcp(toolId, accessScopeOverrides[toolId], instructionOverrides[toolId]);
    if (!resolved || !resolved.mcp.active) continue;

    instructionsById[toolId] = resolved.instruction;
    Object.assign(runtimeVariables, buildRuntimeVariablesForMcp(resolved.mcp));

    for (const tool of resolved.tools) {
      runtimeToolsByName[tool.name] = {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        inputSchema: tool.inputSchema,
        source: "system",
        capabilityId: toolId,
        accessScope: accessScopeOverrides[toolId],
        isConcurrencySafe: (input) => isConcurrencySafeSystemTool(tool.name, input),
        interruptBehavior: "block",
        resultPolicy: buildSystemToolResultPolicy(resolved.mcp, tool.name),
        permissionPolicy: buildSystemToolPermissionPolicy(tool.name),
        resolvePermission: buildSystemToolPermissionResolver(tool.name),
      };
    }
  }

  return {
    instructionsById,
    runtimeToolsByName,
    runtimeVariables,
  };
}

export async function toggleSystemMcp(id: string, active: boolean): Promise<McpServerConfig> {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) throw new NotFoundError("System-MCP", id);
  const next = { ...systemMcp, active };
  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
}

async function updateSystemMcpConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) throw new NotFoundError("System-MCP", id);

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
  if (body.skillIds !== undefined) next.skillIds = body.skillIds;

  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
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
  context?: import("../loop/types.js").ToolRuntimeContext,
): Promise<import("../loop/types.js").ToolExecutionResult | null> {
  const resolved = resolveSystemMcp(id, accessScopeOverride);
  if (!resolved || !resolved.mcp.active) return null;
  const result = await executeSystemTool(resolved.mcp, toolName, args, context);
  if (!result) return null;

  return {
    ...result,
  };
}

export {
  clearSessionFacts,
  clearTasks,
  getMemoryPromptContext,
  getTaskSummary,
  listSessionFacts,
  listTasks,
  listUserFacts,
  replaceSessionFacts,
  replaceTasks,
  replaceUserFacts,
};
