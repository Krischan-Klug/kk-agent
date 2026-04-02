import type { McpServerConfig, McpToolDefinition, SystemMcpKey, ToolCallResult } from "../../mcp/types.js";
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

type SystemToolModule = {
  definition: McpServerConfig;
  tools: McpToolDefinition[];
  execute: (config: McpServerConfig, toolName: string, args: Record<string, unknown>) => Promise<ToolCallResult | null>;
};

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
};

function cloneConfig(config: McpServerConfig): McpServerConfig {
  return {
    ...config,
    systemConfig: config.systemConfig ? { ...config.systemConfig } : undefined,
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
    const key = id as SystemMcpKey;
    if (SYSTEM_TOOL_MODULES[key]) tools.push(...SYSTEM_TOOL_MODULES[key].tools);
  }
  return tools;
}

export function getSystemToolsForMcp(id: string): McpToolDefinition[] {
  const key = id as SystemMcpKey;
  return SYSTEM_TOOL_MODULES[key]?.tools ?? [];
}

export async function executeSystemTool(
  mcp: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  try {
    const key = mcp.systemKey as SystemMcpKey | undefined;
    if (!key || !SYSTEM_TOOL_MODULES[key]) return null;
    return await SYSTEM_TOOL_MODULES[key].execute(mcp, toolName, args);
  } catch (err) {
    return { content: (err as Error).message, isError: true };
  }
}
