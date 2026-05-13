import { defineSystemMcp } from "../system-definition.js";

export const userInteractionDefinition = defineSystemMcp({
  id: "user-interaction",
  name: "User Interaction",
  instruction:
    "Use ask_user when you genuinely need clarification, missing input, approval, confirmation, or a user decision to proceed safely. " +
    "Do not use it as a substitute for reading files, checking tool output, or making reasonable progress on your own. " +
    "When you use it, frame the question as a clear multiple-choice selection with meaningful options that let the work continue quickly.",
  emoji: "💬",
});
