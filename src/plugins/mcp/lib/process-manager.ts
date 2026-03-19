import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerConfig, McpStdioConfig, McpSseConfig, McpToolDefinition, ToolCallResult } from "../types.js";

interface RunningMcp {
  client: Client;
  tools: McpToolDefinition[];
}

const running = new Map<string, RunningMcp>();

function mergeEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env) return undefined;

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...env })) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

export async function startMcp(config: McpServerConfig): Promise<void> {
  if (running.has(config.id)) return;

  const client = new Client({ name: `kk-agent-${config.id}`, version: "0.1.0" });

  let transport;
  if (config.transport === "stdio") {
    const srv = config.server as McpStdioConfig;
    transport = new StdioClientTransport({
      command: srv.command,
      args: srv.args,
      ...(srv.env && { env: mergeEnv(srv.env) }),
    });
  } else {
    const srv = config.server as McpSseConfig;
    transport = new SSEClientTransport(new URL(srv.url));
  }

  await client.connect(transport);

  const { tools: rawTools } = await client.listTools();
  const tools: McpToolDefinition[] = rawTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    mcpId: config.id,
  }));

  running.set(config.id, { client, tools });
}

export async function stopMcp(id: string): Promise<void> {
  const entry = running.get(id);
  if (!entry) return;
  try {
    await entry.client.close();
  } catch {
    // ignore close errors
  }
  running.delete(id);
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

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  // Find which MCP owns this tool
  for (const [, entry] of running) {
    const tool = entry.tools.find((t) => t.name === toolName);
    if (tool) {
      try {
        const result = await entry.client.callTool({ name: toolName, arguments: args });
        const content = (result.content as Array<{ type: string; text?: string }>)
          .map((c) => c.text ?? "")
          .join("\n");
        return { content, isError: !!result.isError };
      } catch (err) {
        return { content: (err as Error).message, isError: true };
      }
    }
  }
  return { content: `Tool "${toolName}" not found in any running MCP`, isError: true };
}
