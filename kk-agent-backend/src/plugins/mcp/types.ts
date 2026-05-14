export { SYSTEM_MCP_KEYS } from "kk-agent-contract";
export type {
  AccessScope,
  CreateMcpBody,
  McpServerConfig,
  McpSseConfig,
  McpStdioConfig,
  McpToolDefinition,
  SystemMcpConfig,
  SystemMcpKey,
  ToolResultPolicy,
  UpdateMcpBody,
} from "kk-agent-contract";

export interface ToolCallResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}
