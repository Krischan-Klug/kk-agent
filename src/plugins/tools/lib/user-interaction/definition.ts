import type { McpServerConfig } from "../../../mcp/types.js";

export const userInteractionDefinition: McpServerConfig = {
  id: "user-interaction",
  name: "User Interaction",
  active: true,
  instruction:
    "Use ask_user when you need user input, clarification, or decisions. " +
    "Provide meaningful choices. The user can also type a custom answer (returned as 'custom:<text>'). " +
    "Handle both choice keys and custom responses gracefully.",
  emoji: "💬",
  source: "system",
  systemKey: "user-interaction",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
