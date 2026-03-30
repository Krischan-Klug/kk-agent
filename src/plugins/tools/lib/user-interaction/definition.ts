import type { McpServerConfig } from "../../../mcp/types.js";

export const userInteractionDefinition: McpServerConfig = {
  id: "user-interaction",
  name: "User Interaction",
  active: true,
  instruction:
    "Use ask_user when you need user input, clarification, or decisions. " +
    "Provide meaningful choices that cover the most likely answers.",
  emoji: "💬",
  source: "system",
  systemKey: "user-interaction",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
