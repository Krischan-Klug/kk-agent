import type { InternalToolDefinition, InternalToolDescriptor, InternalToolId } from "../types.js";
import { filesystemDefinition } from "./filesystem/definition.js";
import { executeFilesystemTool } from "./filesystem/runtime.js";
import { filesystemTools } from "./filesystem/tools.js";
import { terminalDefinition } from "./terminal/definition.js";
import { executeTerminalTool } from "./terminal/runtime.js";
import { TERMINAL_TOOLS } from "./terminal/tools.js";
import { getTerminalShellProfile } from "./terminal/shell-profile.js";
import { calculatorDefinition } from "./calculator/definition.js";
import { executeCalculatorTool } from "./calculator/runtime.js";
import { calculatorTools } from "./calculator/tools.js";
import { pythonDefinition } from "./python/definition.js";
import { executePythonTool } from "./python/runtime.js";
import { pythonTools } from "./python/tools.js";
import { userInteractionDefinition } from "./user-interaction/definition.js";
import { executeUserInteractionTool } from "./user-interaction/runtime.js";
import { userInteractionTools } from "./user-interaction/tools.js";
import { taskDefinition } from "./task/definition.js";
import { executeTaskTool } from "./task/runtime.js";
import { taskTools } from "./task/tools.js";
import { memoryDefinition } from "./memory/definition.js";
import { executeMemoryTool } from "./memory/runtime.js";
import { memoryTools } from "./memory/tools.js";
import { attachmentDefinition } from "./attachment/definition.js";
import { executeAttachmentTool } from "./attachment/runtime.js";
import { attachmentTools } from "./attachment/tools.js";
import { skillDefinition } from "./skill/definition.js";
import { executeSkillTool } from "./skill/runtime.js";
import { skillTools } from "./skill/tools.js";
import type { ToolExecutionResult, ToolRuntimeContext } from "../../loop/types.js";
import { getErrorMessage } from "../../../lib/error.js";

type InternalToolModule = {
  definition: InternalToolDefinition;
  tools: InternalToolDescriptor[];
  execute: (
    config: InternalToolDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context?: ToolRuntimeContext,
  ) => Promise<ToolExecutionResult | null>;
};

type NativeInternalToolId = Exclude<InternalToolId, "web-search">;

const INTERNAL_TOOL_MODULES: Record<NativeInternalToolId, InternalToolModule> = {
  filesystem: {
    definition: filesystemDefinition,
    tools: filesystemTools,
    execute: executeFilesystemTool,
  },
  terminal: {
    definition: terminalDefinition,
    tools: [],
    execute: executeTerminalTool,
  },
  calculator: {
    definition: calculatorDefinition,
    tools: calculatorTools,
    execute: executeCalculatorTool,
  },
  python: {
    definition: pythonDefinition,
    tools: pythonTools,
    execute: executePythonTool,
  },
  "user-interaction": {
    definition: userInteractionDefinition,
    tools: userInteractionTools,
    execute: executeUserInteractionTool,
  },
  task: {
    definition: taskDefinition,
    tools: taskTools,
    execute: executeTaskTool,
  },
  memory: {
    definition: memoryDefinition,
    tools: memoryTools,
    execute: executeMemoryTool,
  },
  attachment: {
    definition: attachmentDefinition,
    tools: attachmentTools,
    execute: executeAttachmentTool,
  },
  skill: {
    definition: skillDefinition,
    tools: skillTools,
    execute: executeSkillTool,
  },
};

function isNativeInternalToolId(value: unknown): value is NativeInternalToolId {
  return typeof value === "string" && value in INTERNAL_TOOL_MODULES;
}

function cloneDefinition(definition: InternalToolDefinition): InternalToolDefinition {
  return {
    ...definition,
    config: definition.config
      ? {
          ...definition.config,
          resultPolicy: definition.config.resultPolicy ? { ...definition.config.resultPolicy } : undefined,
        }
      : undefined,
  };
}

export function getDefaultInternalToolMap(): Partial<Record<InternalToolId, InternalToolDefinition>> {
  return Object.fromEntries(
    (Object.keys(INTERNAL_TOOL_MODULES) as NativeInternalToolId[]).map((id) => [id, cloneDefinition(INTERNAL_TOOL_MODULES[id].definition)]),
  ) as Partial<Record<InternalToolId, InternalToolDefinition>>;
}

export function getToolDescriptors(id: string): InternalToolDescriptor[] {
  if (!isNativeInternalToolId(id)) return [];
  if (id === "terminal") {
    return getTerminalShellProfile() ? TERMINAL_TOOLS : [];
  }
  return INTERNAL_TOOL_MODULES[id].tools;
}

export async function executeInternalTool(
  tool: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolExecutionResult | null> {
  try {
    if (!isNativeInternalToolId(tool.id)) return null;
    return await INTERNAL_TOOL_MODULES[tool.id].execute(tool, toolName, args, context);
  } catch (err) {
    return { content: getErrorMessage(err), isError: true };
  }
}
