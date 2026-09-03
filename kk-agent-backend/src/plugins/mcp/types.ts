export type {
  CreateMcpBody,
  McpRuntimeState,
  McpServerConfig,
  McpSseConfig,
  McpStdioConfig,
  McpToolDefinition,
  UpdateMcpBody,
} from "kk-agent-contract";

export interface ToolCallResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}
