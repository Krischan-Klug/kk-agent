import type { McpServerConfig, SystemMcpConfig, SystemMcpKey } from "../../mcp/types.js";

type SystemMcpDefinitionInput = {
  id: SystemMcpKey;
  name: string;
  instruction: string;
  emoji: string;
  systemConfig?: SystemMcpConfig;
};

export function defineSystemMcp({
  id,
  name,
  instruction,
  emoji,
  systemConfig = {},
}: SystemMcpDefinitionInput): McpServerConfig {
  return {
    id,
    name,
    active: true,
    instruction,
    emoji,
    source: "system",
    systemKey: id,
    systemConfig,
    transport: "stdio",
    server: { command: "internal", args: [] },
  };
}
