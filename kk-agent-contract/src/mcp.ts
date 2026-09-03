export interface McpStdioConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpSseConfig {
  url: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  active: boolean;
  instruction: string;
  emoji?: string;
  transport: "stdio" | "sse";
  server: McpStdioConfig | McpSseConfig;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mcpId: string;
}

export type McpRuntimeStatus = "running" | "stopped" | "unavailable";

export interface McpRuntimeState {
  status: McpRuntimeStatus;
  error?: string;
}

export interface McpListItem extends McpServerConfig {
  runtime: McpRuntimeState;
  tools: McpToolDefinition[];
}

export interface CreateMcpBody {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  instruction?: string;
  emoji?: string;
}

export interface UpdateMcpBody {
  name?: string;
  active?: boolean;
  transport?: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  instruction?: string;
  emoji?: string;
}
