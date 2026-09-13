import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import type { ToolRuntimeContext } from "../../../loop/types.js";
import { executeRead } from "./read.js";
import { executeEdit } from "./edit.js";
import { executeWrite } from "./write.js";
import { executeGlob } from "./glob.js";
import { executeGrep } from "./grep.js";
import { executeSaveAsset } from "./save-asset.js";
import {
  executeCopy,
  executeList,
  executeMkdir,
  executeMove,
  executeRemove,
  executeStat,
} from "./operations.js";

export async function executeFilesystemTool(
  config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolCallResult | null> {
  if (toolName === "Read") return executeRead(config, args);
  if (toolName === "Edit") return executeEdit(config, args);
  if (toolName === "Write") return executeWrite(config, args);
  if (toolName === "SaveAsset") return executeSaveAsset(config, args, context);
  if (toolName === "Glob") return executeGlob(config, args, context?.abortSignal);
  if (toolName === "Grep") return executeGrep(config, args, context?.abortSignal);
  if (toolName === "List") return executeList(config, args);
  if (toolName === "Stat") return executeStat(config, args);
  if (toolName === "Mkdir") return executeMkdir(config, args);
  if (toolName === "Move") return executeMove(config, args);
  if (toolName === "Copy") return executeCopy(config, args);
  if (toolName === "Remove") return executeRemove(config, args);
  return null;
}
