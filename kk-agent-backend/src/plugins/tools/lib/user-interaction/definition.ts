import { defineSystemMcp } from "../system-definition.js";

export const userInteractionDefinition = defineSystemMcp({
  id: "user-interaction",
  name: "User Interaction",
  instruction:
    "Use ask_user only when you genuinely need missing information, a user preference, or a user-owned decision that cannot be discovered or inferred safely. " +
    "Never use ask_user to request permission or confirmation for commands, filesystem operations, tool calls, or potentially harmful actions; the harness enforces configured approvals automatically. " +
    "Do not use it as a substitute for reading files, checking tool output, or making reasonable progress autonomously. " +
    "When you use it, frame the question as a clear multiple-choice selection with meaningful options that let the work continue quickly.",
  emoji: "💬",
});
