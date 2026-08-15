import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  McpRuntimeState,
  McpServerConfig,
  McpStdioConfig,
  McpSseConfig,
  McpToolDefinition,
  ToolCallResult,
} from "../types.js";
import { getErrorMessage } from "../../../lib/error.js";
import { createLogger } from "../../../lib/logger.js";

interface RunningMcp {
  client: Client;
  tools: McpToolDefinition[];
}

const running = new Map<string, RunningMcp>();
const runtimeStates = new Map<string, McpRuntimeState>();
const logger = createLogger("mcp");

function unavailable(error: unknown): McpRuntimeState {
  return { status: "unavailable", error: getErrorMessage(error) };
}

function mergeEnv(env?: Record<string, string>): Record<string, string> | undefined {
  const windowsProcessEnv = process.platform === "win32"
    ? { COMSPEC: process.env.COMSPEC, PATHEXT: process.env.PATHEXT }
    : {};
  const source = env ? { ...process.env, ...env } : windowsProcessEnv;

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function createTransport(config: McpServerConfig): StdioClientTransport | SSEClientTransport {
  if (config.transport === "sse") {
    return new SSEClientTransport(new URL((config.server as McpSseConfig).url));
  }

  const server = config.server as McpStdioConfig;
  const env = mergeEnv(server.env);
  return new StdioClientTransport({
    command: server.command,
    args: server.args,
    ...(env && { env }),
  });
}

export async function startMcp(config: McpServerConfig): Promise<McpRuntimeState> {
  if (running.has(config.id)) return { status: "running" };

  const client = new Client({ name: `kk-agent-${config.id}`, version: "0.1.0" });
  let closed = false;
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
    connectionError = error;
    logger.warn(`MCP "${config.name}" connection error: ${getErrorMessage(error)}`);
  };

  try {
    const transport = createTransport(config);

    await client.connect(transport);
    const { tools: rawTools } = await client.listTools();
    if (closed) throw connectionError ?? new Error("Connection closed");

    const tools: McpToolDefinition[] = rawTools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      mcpId: config.id,
    }));

    running.set(config.id, { client, tools });
    const state: McpRuntimeState = { status: "running" };
    runtimeStates.set(config.id, state);
    return state;
  } catch (error) {
    running.delete(config.id);
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
    const result = await entry.client.callTool({ name: toolName, arguments: args });
    const content = (result.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? "")
      .join("\n");
    return { content, isError: !!result.isError };
  } catch (err) {
    return { content: getErrorMessage(err), isError: true };
  }
}
