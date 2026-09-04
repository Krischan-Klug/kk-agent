import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  McpRuntimeState,
  McpServerConfig,
  McpToolDefinition,
  ToolCallResult,
} from "../types.js";
import { getErrorMessage } from "../../../lib/error.js";
import { createLogger } from "../../../lib/logger.js";
import { redactRuntimeCredentials } from "./credentials.js";
import { createMcpTransport } from "./transports/factory.js";

interface RunningMcp {
  client: Client;
  tools: McpToolDefinition[];
  markStopping: () => void;
}

const running = new Map<string, RunningMcp>();
const runtimeStates = new Map<string, McpRuntimeState>();
const logger = createLogger("mcp");

function unavailable(error: unknown): McpRuntimeState {
  return { status: "unavailable", error: redactRuntimeCredentials(getErrorMessage(error)) };
}

const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;

async function connectWithTimeout(client: Client, config: McpServerConfig): Promise<void> {
  const transport = createMcpTransport(config);
  const timeoutMs = config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function startMcp(config: McpServerConfig): Promise<McpRuntimeState> {
  if (running.has(config.id)) return { status: "running" };

  const client = new Client({ name: `kk-agent-${config.id}`, version: "0.1.0" });
  let closed = false;
  let stopping = false;
  let connectionError: Error | undefined;

  client.onclose = () => {
    closed = true;
    if (running.get(config.id)?.client !== client) return;

    running.delete(config.id);
    const state = unavailable(connectionError ?? new Error("Connection closed"));
    runtimeStates.set(config.id, state);
    logger.warn(`MCP "${config.name}" became unavailable: ${state.error}`);
  };
  client.onerror = (error) => {
    if (stopping) return;
    connectionError = error;
    logger.warn(`MCP "${config.name}" connection error: ${redactRuntimeCredentials(getErrorMessage(error))}`);
  };

  try {
    await connectWithTimeout(client, config);
    const { tools: rawTools } = await client.listTools();
    if (closed) throw connectionError ?? new Error("Connection closed");

    const allowedTools = config.allowedTools ? new Set(config.allowedTools) : undefined;
    const tools: McpToolDefinition[] = rawTools
      .filter((tool) => !allowedTools || allowedTools.has(tool.name))
      .map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      mcpId: config.id,
      }));

    running.set(config.id, { client, tools, markStopping: () => { stopping = true; } });
    const state: McpRuntimeState = { status: "running" };
    runtimeStates.set(config.id, state);
    return state;
  } catch (error) {
    running.delete(config.id);
    stopping = true;
    try {
      await client.close();
    } catch {
      // The failed connection may already be closed.
    }
    const state = unavailable(connectionError ?? error);
    runtimeStates.set(config.id, state);
    logger.error(`MCP "${config.name}" is unavailable: ${state.error}`);
    return state;
  }
}

export async function stopMcp(id: string): Promise<McpRuntimeState> {
  const entry = running.get(id);
  running.delete(id);
  if (entry) {
    entry.markStopping();
    try {
      await entry.client.close();
    } catch {
      // A stopped MCP is stopped even when transport cleanup fails.
    }
  }
  const state: McpRuntimeState = { status: "stopped" };
  runtimeStates.set(id, state);
  return state;
}

export async function stopAllMcps(): Promise<void> {
  await Promise.all([...running.keys()].map(stopMcp));
}

export function getMcpRuntimeState(id: string): McpRuntimeState {
  return runtimeStates.get(id) ?? { status: "stopped" };
}

export function forgetMcpRuntimeState(id: string): void {
  runtimeStates.delete(id);
}

export function getRunningMcps(): string[] {
  return [...running.keys()];
}

export function getToolsForMcp(id: string): McpToolDefinition[] {
  return running.get(id)?.tools ?? [];
}

export function getAllTools(activeMcpIds: string[]): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];
  for (const id of activeMcpIds) {
    const entry = running.get(id);
    if (entry) tools.push(...entry.tools);
  }
  return tools;
}

export async function executeToolForMcp(
  mcpId: string,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const entry = running.get(mcpId);
  if (!entry) {
    return { content: `MCP "${mcpId}" is not running`, isError: true };
  }
  const tool = entry.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    return { content: `Tool "${toolName}" not found in MCP "${mcpId}"`, isError: true };
  }

  try {
    const result = await entry.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { signal },
    );
    const content = (result.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? "")
      .join("\n");
    return { content: redactRuntimeCredentials(content), isError: !!result.isError };
  } catch (err) {
    return { content: redactRuntimeCredentials(getErrorMessage(err)), isError: true };
  }
}
