import type { RuntimeToolDefinition } from "../loop/types.js";
import type {
  AccessScope,
  ApprovalMode,
  InternalToolDefinition,
  InternalToolDescriptor,
  InternalToolId,
  UpdateInternalToolBody,
} from "./types.js";
import { buildInternalTools, createOverrideState, loadInternalToolOverrides, saveInternalToolOverrides } from "./lib/internal-tool-registry.js";
import { executeInternalTool, getDefaultInternalToolMap, getToolDescriptors } from "./lib/tool-modules.js";
import { clearSessionFacts, getMemoryPromptContext, initMemoryState, listSessionFacts, listUserFacts, replaceSessionFacts, replaceUserFacts } from "./lib/memory-state.js";
import { clearTasks, getTaskSummary, listTasks, replaceTasks } from "./lib/task-state.js";
import type { MemoryFact, TaskItem } from "./types.js";
import {
  getDefaultPathForScope,
  resolveAccessScope,
} from "./lib/access-paths.js";
import { NotFoundError } from "../../lib/errors.js";
import { normalizeInternalToolConfig } from "./lib/internal-tool-config.js";
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

let internalTools: InternalToolDefinition[] = [];

export interface ResolvedInternalToolRuntime {
  instructionsById: Record<string, string>;
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  runtimeVariables: Record<string, string>;
}

const SELF_BOUNDED_READ_TOOLS = new Set([
  "Read",
  "read_asset",
  "search_asset",
]);

function isConcurrencySafeInternalTool(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === "Terminal") {
    const action = input.action === undefined ? "run" : String(input.action).trim().toLowerCase();
    if (action === "status") return true;
    if (action !== "run") return false;
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

function buildToolResultPolicy(tool: InternalToolDefinition, toolName: string) {
  return {
    previewThresholdChars: tool.config?.resultPolicy?.previewThresholdChars,
    previewChars: tool.config?.resultPolicy?.previewChars,
    excludeFromContextBudget: SELF_BOUNDED_READ_TOOLS.has(toolName),
  };
}

function buildToolPermissionResolver(
  toolName: string,
  approvalMode: ApprovalMode,
): RuntimeToolDefinition["resolvePermission"] | undefined {
  if (toolName !== "Terminal") return undefined;

  return (_resolvedToolName, args, mode) => {
    const command = String(args.command ?? "").trim();
    const profile = getTerminalShellProfile();
    return resolveTerminalCommandPermission({
      action: args.action,
      command,
      taskId: args.taskId,
      modeBehavior: mode.behavior,
      shellDialect: profile?.dialect,
      approvalMode,
    });
  };
}

function mergeToolConfig(id: InternalToolId, config?: InternalToolDefinition["config"]) {
  const baseConfig = getDefaultInternalToolMap()[id].config;
  const explicitResultPolicy = Object.prototype.hasOwnProperty.call(config ?? {}, "resultPolicy");

  const merged = {
    ...baseConfig,
    ...config,
    ...(explicitResultPolicy ? { resultPolicy: { ...baseConfig?.resultPolicy, ...config?.resultPolicy } } : {}),
  };

  return normalizeInternalToolConfig(merged);
}

function buildRuntimeVariables(tool: InternalToolDefinition): Record<string, string> {
  if (tool.id === "filesystem") {
    const scope = resolveAccessScope(tool.config?.accessScope);
    const root = getDefaultPathForScope(scope);
    return {
      FILESYSTEM_ACCESS_SCOPE: scope,
      FILESYSTEM_ROOT: root,
    };
  }

  if (tool.id === "terminal") {
    const scope = resolveAccessScope(tool.config?.accessScope);
    const root = getDefaultPathForScope(scope);
    const profile = getTerminalShellProfile();
    return {
      TERMINAL_ACCESS_SCOPE: scope,
      TERMINAL_APPROVAL_MODE: resolveApprovalMode(tool.config?.approvalMode),
      TERMINAL_ROOT: root,
      TERMINAL_CWD: root,
      ...(profile ? {
        TERMINAL_SHELL: `${profile.displayName} ${profile.version}`,
        TERMINAL_PRIVILEGE: "current_user",
      } : {}),
    };
  }

  return {};
}

function setInternalTool(tool: InternalToolDefinition): void {
  internalTools = internalTools.map((entry) => (entry.id === tool.id ? tool : entry));
}

async function persistToolOverrides(): Promise<void> {
  await saveInternalToolOverrides(createOverrideState(internalTools));
}

function resolveInternalTool(
  id: string,
  accessScopeOverride?: AccessScope,
  instructionOverride?: string,
  approvalModeOverride?: ApprovalMode,
): { tool: InternalToolDefinition; instruction: string; tools: InternalToolDescriptor[] } | null {
  const definition = getInternalTool(id);
  if (!definition) return null;
  if (id === "terminal" && getTerminalShellResolution().status === "unavailable") return null;

  const security = getSecuritySettings();
  const accessScope = accessScopeOverride ?? security.accessScope;
  const approvalMode = approvalModeOverride ?? security.approvalMode;
  const tool: InternalToolDefinition = {
    ...definition,
    config: {
      ...mergeToolConfig(definition.id, definition.config),
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

  const baseInstruction = instructionOverride ?? tool.instruction;
  const profile = id === "terminal" ? getTerminalShellProfile() : undefined;
  return {
    tool,
    instruction: profile
      ? [
          baseInstruction,
          profile.pathConvention,
          profile.syntaxRules,
          "Commands run with the current operating-system user privileges. Access scope never grants administrator or root privileges.",
          "For background commands, keep the returned taskId and use Terminal action=status or action=stop; never construct raw process-kill commands.",
          "The active shell profile is fixed for this run. Do not assume or silently switch to a different shell dialect.",
        ].join(" ")
      : baseInstruction,
    tools: getToolDescriptors(id),
  };
}

export async function initToolsService(): Promise<void> {
  initializeTerminalShell();
  internalTools = buildInternalTools(await loadInternalToolOverrides());
  await persistToolOverrides();
  await initMemoryState();
}

export function listInternalTools(): InternalToolDefinition[] {
  return [...internalTools];
}

export function getInternalTool(id: string): InternalToolDefinition | undefined {
  return internalTools.find((tool) => tool.id === id);
}

export function getKnownInternalToolIds(): string[] {
  return internalTools.map((tool) => tool.id);
}

export function getRunnableInternalToolIds(): string[] {
  return internalTools
    .filter((tool) => getInternalToolRuntimeState(tool).status === "running")
    .map((tool) => tool.id);
}

export function getInternalToolRuntimeState(tool: InternalToolDefinition): { status: "running" | "stopped" | "unavailable"; error?: string } {
  if (!tool.active) return { status: "stopped" };
  if (tool.id === "terminal") {
    const resolution = getTerminalShellResolution();
    if (resolution.status === "unavailable") return { status: "unavailable", error: resolution.error };
  }
  return { status: "running" };
}

export function getActiveToolInstructions(): { id: string; name: string; instruction: string }[] {
  return internalTools
    .filter((tool) => getInternalToolRuntimeState(tool).status === "running")
    .map(({ id, name, instruction }) => ({ id, name, instruction }));
}

export function getInternalToolState(sessionId: string): { tasks: TaskItem[]; sessionFacts: MemoryFact[]; userFacts: MemoryFact[] } {
  return {
    tasks: listTasks(sessionId),
    sessionFacts: listSessionFacts(sessionId),
    userFacts: listUserFacts(),
  };
}



export function buildResolvedInternalToolRuntime(
  activeToolIds: string[],
  accessScopeOverrides: Record<string, AccessScope> = {},
  instructionOverrides: Record<string, string> = {},
  approvalModeOverride?: ApprovalMode,
): ResolvedInternalToolRuntime {
  const instructionsById: Record<string, string> = {};
  const runtimeToolsByName: Record<string, RuntimeToolDefinition> = {};
  const runtimeVariables: Record<string, string> = {};

  for (const toolId of activeToolIds) {
    const resolved = resolveInternalTool(
      toolId,
      accessScopeOverrides[toolId],
      instructionOverrides[toolId],
      approvalModeOverride,
    );
    if (!resolved || !resolved.tool.active) continue;

    instructionsById[toolId] = resolved.instruction;
    Object.assign(runtimeVariables, buildRuntimeVariables(resolved.tool));

    for (const tool of resolved.tools) {
      runtimeToolsByName[tool.name] = {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        source: "internal",
        capabilityId: toolId,
        accessScope: resolveAccessScope(resolved.tool.config?.accessScope),
        isConcurrencySafe: (input) => isConcurrencySafeInternalTool(tool.name, input),
        resultPolicy: buildToolResultPolicy(resolved.tool, tool.name),
        permissionPolicy: { kind: "allow" },
        resolvePermission: buildToolPermissionResolver(
          tool.name,
          resolveApprovalMode(resolved.tool.config?.approvalMode),
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

export async function updateInternalToolConfig(id: string, body: UpdateInternalToolBody): Promise<InternalToolDefinition> {
  const current = getInternalTool(id);
  if (!current) throw new NotFoundError("Internal tool", id);

  const next: InternalToolDefinition = {
    ...current,
    active: body.active ?? current.active,
    instruction: body.instruction ?? current.instruction,
    config: mergeToolConfig(current.id, {
      ...current.config,
      ...body.config,
    }),
  };

  if (body.name !== undefined) next.name = body.name;
  if (body.emoji !== undefined) next.emoji = body.emoji;

  setInternalTool(next);
  await persistToolOverrides();
  return next;
}

export async function executeInternalToolById(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  accessScopeOverride?: AccessScope,
  context?: import("../loop/types.js").ToolRuntimeContext,
): Promise<import("../loop/types.js").ToolExecutionResult | null> {
  const resolved = resolveInternalTool(id, accessScopeOverride);
  if (!resolved || !resolved.tool.active) return null;
  const result = await executeInternalTool(resolved.tool, toolName, args, context);
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
