import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

export async function executeTaskTool(
  _config: McpServerConfig,
  _toolName: string,
  _args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  return null;
}
