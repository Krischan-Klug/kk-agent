import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { executeRead } from "./read.js";
import { executeEdit } from "./edit.js";
import { executeWrite } from "./write.js";
import { executeGlob } from "./glob.js";
import { executeGrep } from "./grep.js";

export async function executeFilesystemTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName === "Read") return executeRead(config, args);
  if (toolName === "Edit") return executeEdit(config, args);
  if (toolName === "Write") return executeWrite(config, args);
  if (toolName === "Glob") return executeGlob(config, args);
  if (toolName === "Grep") return executeGrep(config, args);
  return null;
}
