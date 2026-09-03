import type { InternalToolDefinition, InternalToolDescriptor, InternalToolId } from "../types.js";
import { filesystemDefinition } from "./filesystem/definition.js";
import { executeFilesystemTool } from "./filesystem/runtime.js";
import { filesystemTools } from "./filesystem/tools.js";
import { terminalDefinition } from "./terminal/definition.js";
import { executeTerminalTool } from "./terminal/runtime.js";
import { TERMINAL_TOOLS } from "./terminal/tools.js";
import { getTerminalShellProfile } from "./terminal/shell-profile.js";
import { webSearchDefinition } from "./web-search/definition.js";
import { executeWebSearchTool } from "./web-search/runtime.js";
import { webSearchTools } from "./web-search/tools.js";
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

function isInternalToolId(value: unknown): value is InternalToolId {
  return typeof value === "string" && value in INTERNAL_TOOL_MODULES;
}

const INTERNAL_TOOL_MODULES: Record<InternalToolId, InternalToolModule> = {
  filesystem: {
    definition: filesystemDefinition,
    tools: filesystemTools,
    execute: executeFilesystemTool,
  },
  "web-search": {
    definition: webSearchDefinition,
    tools: webSearchTools,
    execute: executeWebSearchTool,
  },
  terminal: {
    definition: terminalDefinition,
    tools: [],
    execute: executeTerminalTool,
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

export function getDefaultInternalToolMap(): Record<InternalToolId, InternalToolDefinition> {
  return Object.fromEntries(
    (Object.keys(INTERNAL_TOOL_MODULES) as InternalToolId[]).map((id) => [id, cloneDefinition(INTERNAL_TOOL_MODULES[id].definition)]),
  ) as Record<InternalToolId, InternalToolDefinition>;
}

export function getToolDescriptors(id: string): InternalToolDescriptor[] {
  if (!isInternalToolId(id)) return [];
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
    if (!isInternalToolId(tool.id)) return null;
    return await INTERNAL_TOOL_MODULES[tool.id].execute(tool, toolName, args, context);
  } catch (err) {
    return { content: getErrorMessage(err), isError: true };
  }
}
