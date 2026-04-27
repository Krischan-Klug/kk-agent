import type { McpServerConfig, McpToolDefinition, SystemMcpKey } from "../../mcp/types.js";
import { filesystemDefinition } from "./filesystem/definition.js";
import { executeFilesystemTool } from "./filesystem/runtime.js";
import { filesystemTools } from "./filesystem/tools.js";
import { terminalDefinition } from "./terminal/definition.js";
import { executeTerminalTool } from "./terminal/runtime.js";
import { terminalTools } from "./terminal/tools.js";
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

type SystemToolModule = {
  definition: McpServerConfig;
  tools: McpToolDefinition[];
  execute: (
    config: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    context?: ToolRuntimeContext,
  ) => Promise<ToolExecutionResult | null>;
};

function isSystemMcpKey(value: unknown): value is SystemMcpKey {
  return typeof value === "string" && value in SYSTEM_TOOL_MODULES;
}

const SYSTEM_TOOL_MODULES: Record<SystemMcpKey, SystemToolModule> = {
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
    tools: terminalTools,
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

function cloneConfig(config: McpServerConfig): McpServerConfig {
  return {
    ...config,
    systemConfig: config.systemConfig
      ? {
          ...config.systemConfig,
          resultPolicy: config.systemConfig.resultPolicy ? { ...config.systemConfig.resultPolicy } : undefined,
        }
      : undefined,
    server:
      "command" in config.server
        ? { ...config.server, args: [...config.server.args], env: config.server.env ? { ...config.server.env } : undefined }
        : { ...config.server },
  };
}

export function getDefaultSystemMcpMap(): Record<SystemMcpKey, McpServerConfig> {
  return Object.fromEntries(
    (Object.keys(SYSTEM_TOOL_MODULES) as SystemMcpKey[]).map((key) => [key, cloneConfig(SYSTEM_TOOL_MODULES[key].definition)]),
  ) as Record<SystemMcpKey, McpServerConfig>;
}

export function getSystemToolDefinitions(activeMcpIds: string[]): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];
  for (const id of activeMcpIds) {
    if (isSystemMcpKey(id)) tools.push(...SYSTEM_TOOL_MODULES[id].tools);
  }
  return tools;
}

export function getSystemToolsForMcp(id: string): McpToolDefinition[] {
  return isSystemMcpKey(id) ? SYSTEM_TOOL_MODULES[id].tools : [];
}

export async function executeSystemTool(
  mcp: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolExecutionResult | null> {
  try {
    const key = mcp.systemKey;
    if (!isSystemMcpKey(key)) return null;
    return await SYSTEM_TOOL_MODULES[key].execute(mcp, toolName, args, context);
  } catch (err) {
    return { content: getErrorMessage(err), isError: true };
  }
}
