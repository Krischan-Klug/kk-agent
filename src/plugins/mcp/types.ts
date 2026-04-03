export type McpSource = "system" | "custom";
export type SystemMcpKey = "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory" | "attachment";
export type AccessScope = "user" | "system";

export interface SystemMcpConfig {
  accessScope?: AccessScope;
  basePath?: string;
  workingDirectory?: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  active: boolean;
  instruction: string;
  emoji?: string;
  source?: McpSource;
  systemKey?: SystemMcpKey;
  systemConfig?: SystemMcpConfig;
  transport: "stdio" | "sse";
  server: McpStdioConfig | McpSseConfig;
}

export interface McpStdioConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpSseConfig {
  url: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mcpId: string;
}

export interface ToolCallResult {
  content: string;
  isError: boolean;
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
  systemConfig?: SystemMcpConfig;
}
