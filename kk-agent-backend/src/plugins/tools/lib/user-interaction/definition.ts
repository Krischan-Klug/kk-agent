import { defineInternalTool } from "../internal-tool-definition.js";

export const userInteractionDefinition = defineInternalTool({
  id: "user-interaction",
  name: "User Interaction",
  instruction:
    "Use ask_user only for missing information or a user-owned decision that cannot be inferred safely. " +
    "Ask one clear multiple-choice question with meaningful options.",
  emoji: "💬",
});
