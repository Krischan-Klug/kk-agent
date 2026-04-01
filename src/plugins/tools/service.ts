import type { UnifiedToolDefinition } from "../provider/lib/types.js";
import type { McpServerConfig, McpToolDefinition, ToolCallResult, UpdateMcpBody } from "../mcp/types.js";
import { buildSystemMcps, createOverrideState, loadSystemMcpOverrides, saveSystemMcpOverrides } from "./lib/system-registry.js";
import { executeSystemTool, getSystemToolDefinitions, getSystemToolsForMcp } from "./lib/index.js";
import { getCurrentSessionId } from "./lib/user-interaction/interaction-store.js";
import { clearSessionFacts, getMemoryPromptContext, initMemoryState, listSessionFacts, listUserFacts, replaceSessionFacts, replaceUserFacts } from "./lib/memory-state.js";
import { clearTasks, getTaskSummary, listTasks, replaceTasks } from "./lib/task-state.js";
import type { MemoryFact, TaskItem, ToolResultOptions } from "./types.js";

let cachedSystemMcps: McpServerConfig[] = [];

function setSystemMcp(mcp: McpServerConfig): void {
  cachedSystemMcps = cachedSystemMcps.map((entry) => (entry.id === mcp.id ? mcp : entry));
}

async function persistSystemOverrides(): Promise<void> {
  await saveSystemMcpOverrides(createOverrideState(cachedSystemMcps));
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

export function getSystemToolDefinitionsForActive(activeMcpIds: string[]): UnifiedToolDefinition[] {
  return getSystemToolDefinitions(activeMcpIds).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for internal tool.");
  return sessionId;
}

function normalizeToolResultForContext(content: string, options: ToolResultOptions = {}): string {
  const maxChars = options.maxContextChars ?? 1200;
  const normalized = content.trim();
  if (normalized.length <= maxChars) return normalized;

  const preview = normalized.slice(0, maxChars);
  return `${preview}\n\n[Ausgabe gekuerzt: ${normalized.length} Zeichen insgesamt]`;
}

function taskSummary(tasks: TaskItem[]): string {
  if (tasks.length === 0) return "Keine Tasks gesetzt.";
  return tasks.map((task) => `- [${task.status}] ${task.title}${task.notes ? ` (${task.notes})` : ""}`).join("\n");
}

function memorySummary(facts: MemoryFact[]): string {
  if (facts.length === 0) return "Keine Facts gespeichert.";
  return facts.map((fact) => `- ${fact.text}`).join("\n");
}

async function executeInternalToolByName(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName === "update_tasks") {
    const sessionId = getSessionIdOrThrow();
    const tasks = replaceTasks(sessionId, Array.isArray(args.tasks) ? args.tasks as TaskItem[] : []);
    return {
      content: `Tasks aktualisiert.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  if (toolName === "remember_facts") {
    const facts = Array.isArray(args.facts) ? args.facts as MemoryFact[] : [];
    const scope = String(args.scope ?? "");
    if (scope !== "session" && scope !== "user") {
      return { content: "scope must be 'session' or 'user'", isError: true };
    }

    if (scope === "session") {
      const sessionId = getSessionIdOrThrow();
      const next = replaceSessionFacts(sessionId, facts);
      return { content: `Session-Memory aktualisiert.\n${memorySummary(next)}`, isError: false };
    }

    const next = await replaceUserFacts(facts);
    return { content: `User-Memory aktualisiert.\n${memorySummary(next)}`, isError: false };
  }

  return null;
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

export async function executeSystemToolByName(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const internal = await executeInternalToolByName(toolName, args);
  if (internal) return normalizeToolResult(internal);

  for (const mcp of cachedSystemMcps) {
    if (!mcp.active) continue;
    const result = await executeSystemTool(mcp, toolName, args);
    if (result) return normalizeToolResult(result);
  }
  return null;
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
