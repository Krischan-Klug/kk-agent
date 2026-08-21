import type { McpSource } from "./transcript.js";

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
export type ApprovalMode = "ask_approval" | "full_access";

export interface SecuritySettings {
  accessScope: AccessScope;
  approvalMode: ApprovalMode;
}

export interface ToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
}

export interface SystemMcpConfig {
  /** Effective runtime values. They are owned by Security settings, not editable tool settings. */
  accessScope?: AccessScope;
  approvalMode?: ApprovalMode;
  basePath?: string;
  workingDirectory?: string;
  resultPolicy?: ToolResultPolicy;
}

export interface SystemMcpUpdateConfig {
  resultPolicy?: ToolResultPolicy;
}

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
  source?: McpSource;
  systemKey?: SystemMcpKey;
  systemConfig?: SystemMcpConfig;
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
  systemConfig?: SystemMcpUpdateConfig;
}
