import type { McpServerConfig } from "../../../mcp/types.js";

export const userInteractionDefinition: McpServerConfig = {
  id: "user-interaction",
  name: "User Interaction",
  active: true,
  instruction:
    "Use ask_user when you genuinely need clarification, missing input, approval, confirmation, or a user decision to proceed safely. " +
    "Do not use it as a substitute for reading files, checking tool output, or making reasonable progress on your own. " +
    "When you use it, frame the question as a clear multiple-choice selection with meaningful options that let the work continue quickly.",
  emoji: "💬",
  source: "system",
  systemKey: "user-interaction",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
