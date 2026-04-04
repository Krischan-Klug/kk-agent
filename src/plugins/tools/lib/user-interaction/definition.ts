import type { McpServerConfig } from "../../../mcp/types.js";

export const userInteractionDefinition: McpServerConfig = {
  id: "user-interaction",
  name: "User Interaction",
  active: true,
  instruction:
    "Use the ask_user tool for user-facing questions by default. " +
    "Whenever you need input, clarification, confirmation, preference, or a decision from the user, ask through this tool instead of asking in plain text. " +
    "Frame the question as a clear multiple-choice selection and provide meaningful options that let the conversation continue. " +
    "Use this behavior broadly for essentially all questions to the user, only skipping it when no user input is needed at all.",
  emoji: "💬",
  source: "system",
  systemKey: "user-interaction",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
