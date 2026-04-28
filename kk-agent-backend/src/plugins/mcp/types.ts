export { SYSTEM_MCP_KEYS } from "@krischan-klug/kk-agent-contract";
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
} from "@krischan-klug/kk-agent-contract";

export interface ToolCallResult {
  content: string;
  isError: boolean;
}
