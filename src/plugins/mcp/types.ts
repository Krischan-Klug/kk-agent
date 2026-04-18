export type McpSource = "system" | "custom";
export const SYSTEM_MCP_KEYS = [
  "filesystem",
  "web-search",
  "terminal",
  "user-interaction",
  "task",
  "memory",
  "attachment",
  "skill",
] as const;
export type SystemMcpKey = (typeof SYSTEM_MCP_KEYS)[number];
export type AccessScope = "user" | "system";

export interface ToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
}

export interface SystemMcpConfig {
  accessScope?: AccessScope;
  basePath?: string;
  workingDirectory?: string;
  resultPolicy?: ToolResultPolicy;
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
  skillIds?: string[];
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
  skillIds?: string[];
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
  skillIds?: string[];
}
