import type { McpServerConfig } from "../../../mcp/types.js";

export const userInteractionDefinition: McpServerConfig = {
  id: "user-interaction",
  name: "User Interaction",
  active: true,
  instruction:
    "Use the ask_user tool when you need the user to make a choice between specific options before proceeding. " +
    "Present a clear question and meaningful choices. Do not use this for open-ended questions — only for discrete selections.",
  emoji: "💬",
  source: "system",
  systemKey: "user-interaction",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
