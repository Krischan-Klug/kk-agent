import type { RuntimeToolDefinition } from "../loop/types.js";
import type {
  AccessScope,
  ApprovalMode,
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
  resolveAccessScope,
} from "./lib/access-paths.js";
import { NotFoundError } from "../../lib/errors.js";
import { getDefaultSystemMcpMap } from "./lib/index.js";
import { normalizeSystemConfig } from "./lib/system-config.js";
import { isReadOnlyShellCommand } from "./lib/terminal/command-policy.js";
import {
  resolveApprovalMode,
  resolveTerminalCommandPermission,
} from "./lib/terminal/approval-policy.js";
import {
  getTerminalShellProfile,
  getTerminalShellResolution,
  initializeTerminalShell,
} from "./lib/terminal/shell-profile.js";
import { getSecuritySettings } from "../security/service.js";

let cachedSystemMcps: McpServerConfig[] = [];

export interface ResolvedSystemToolRuntime {
  instructionsById: Record<string, string>;
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  runtimeVariables: Record<string, string>;
}

const SELF_BOUNDED_READ_SYSTEM_TOOLS = new Set([
  "Read",
  "read_asset",
  "search_asset",
]);

function isConcurrencySafeSystemTool(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === "Terminal") {
    return isReadOnlyShellCommand(String(input.command ?? ""), getTerminalShellProfile()?.dialect);
  }

  return new Set([
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "list_assets",
    "search_asset",
    "read_asset",
    "ask_user",
  ]).has(toolName);
}

function buildSystemToolResultPolicy(mcp: McpServerConfig, toolName: string) {
  return {
    previewThresholdChars: mcp.systemConfig?.resultPolicy?.previewThresholdChars,
    previewChars: mcp.systemConfig?.resultPolicy?.previewChars,
    excludeFromContextBudget: SELF_BOUNDED_READ_SYSTEM_TOOLS.has(toolName),
  };
}

function buildSystemToolPermissionResolver(
  toolName: string,
  approvalMode: ApprovalMode,
): RuntimeToolDefinition["resolvePermission"] | undefined {
  if (toolName !== "Terminal") return undefined;

  return (_resolvedToolName, args, mode) => {
    const command = String(args.command ?? "").trim();
    const profile = getTerminalShellProfile();
    return resolveTerminalCommandPermission({
      command,
      modeBehavior: mode.behavior,
      shellDialect: profile?.dialect,
      approvalMode,
    });
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
    const scope = resolveAccessScope(mcp.systemConfig?.accessScope);
    const root = getDefaultPathForScope(scope);
    return {
      FILESYSTEM_ACCESS_SCOPE: scope,
      FILESYSTEM_ROOT: root,
    };
  }

  if (mcp.systemKey === "terminal") {
    const scope = resolveAccessScope(mcp.systemConfig?.accessScope);
    const root = getDefaultPathForScope(scope);
    const profile = getTerminalShellProfile();
    return {
      TERMINAL_ACCESS_SCOPE: scope,
      TERMINAL_APPROVAL_MODE: resolveApprovalMode(mcp.systemConfig?.approvalMode),
      TERMINAL_ROOT: root,
      TERMINAL_CWD: root,
      ...(profile ? {
        TERMINAL_SHELL: `${profile.displayName} ${profile.version}`,
      } : {}),
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
  approvalModeOverride?: ApprovalMode,
): { mcp: McpServerConfig; instruction: string; tools: McpToolDefinition[]; accessContext?: string } | null {
  const systemMcp = getSystemMcpById(id);
  if (!systemMcp) return null;
  if (id === "terminal" && getTerminalShellResolution().status === "unavailable") return null;

  const security = getSecuritySettings();
  const accessScope = accessScopeOverride ?? security.accessScope;
  const approvalMode = approvalModeOverride ?? security.approvalMode;
  const toolConfig = normalizeSystemConfigForMcp(id, systemMcp.systemConfig);
  const mcp: McpServerConfig = {
    ...systemMcp,
    systemConfig: {
      ...toolConfig,
      ...((id === "filesystem" || id === "terminal") ? {
        accessScope,
        ...(id === "filesystem" ? { basePath: getDefaultPathForScope(accessScope) } : {}),
        ...(id === "terminal" ? {
          workingDirectory: getDefaultPathForScope(accessScope),
          approvalMode,
        } : {}),
      } : {}),
    },
  };

  const baseInstruction = instructionOverride ?? mcp.instruction;
  const profile = id === "terminal" ? getTerminalShellProfile() : undefined;
  return {
    mcp,
    instruction: profile
      ? [
          baseInstruction,
          profile.pathConvention,
          profile.syntaxRules,
          "The active shell profile is fixed for this run. Do not assume or silently switch to a different shell dialect.",
        ].join(" ")
      : baseInstruction,
    tools: getSystemToolsForMcp(id),
  };
}

export async function initToolsService(): Promise<void> {
  initializeTerminalShell();
  cachedSystemMcps = buildSystemMcps(await loadSystemMcpOverrides());
  await persistSystemOverrides();
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
  return cachedSystemMcps
    .filter((mcp) => getSystemMcpRuntimeState(mcp).status === "running")
    .map((mcp) => mcp.id);
}

export function getSystemMcpRuntimeState(mcp: McpServerConfig): { status: "running" | "stopped" | "unavailable"; error?: string } {
  if (!mcp.active) return { status: "stopped" };
  if (mcp.systemKey === "terminal") {
    const resolution = getTerminalShellResolution();
    if (resolution.status === "unavailable") return { status: "unavailable", error: resolution.error };
  }
  return { status: "running" };
}

export function getActiveToolInstructions(): { id: string; name: string; instruction: string }[] {
  return cachedSystemMcps
    .filter((mcp) => getSystemMcpRuntimeState(mcp).status === "running")
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
  approvalModeOverride?: ApprovalMode,
): ResolvedSystemToolRuntime {
  const instructionsById: Record<string, string> = {};
  const runtimeToolsByName: Record<string, RuntimeToolDefinition> = {};
  const runtimeVariables: Record<string, string> = {};

  for (const toolId of activeToolIds) {
    const resolved = resolveSystemMcp(
      toolId,
      accessScopeOverrides[toolId],
      instructionOverrides[toolId],
      approvalModeOverride,
    );
    if (!resolved || !resolved.mcp.active) continue;

    instructionsById[toolId] = resolved.instruction;
    Object.assign(runtimeVariables, buildRuntimeVariablesForMcp(resolved.mcp));

    for (const tool of resolved.tools) {
      runtimeToolsByName[tool.name] = {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        source: "system",
        capabilityId: toolId,
        accessScope: resolveAccessScope(resolved.mcp.systemConfig?.accessScope),
        isConcurrencySafe: (input) => isConcurrencySafeSystemTool(tool.name, input),
        resultPolicy: buildSystemToolResultPolicy(resolved.mcp, tool.name),
        permissionPolicy: { kind: "allow" },
        resolvePermission: buildSystemToolPermissionResolver(
          tool.name,
          resolveApprovalMode(resolved.mcp.systemConfig?.approvalMode),
        ),
      };
    }
  }

  return {
    instructionsById,
    runtimeToolsByName,
    runtimeVariables,
  };
}

export async function updateInternalToolConfig(id: string, body: UpdateMcpBody): Promise<McpServerConfig> {
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

  setSystemMcp(next);
  await persistSystemOverrides();
  return next;
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
