import { defineSystemMcp } from "../system-definition.js";

export const userInteractionDefinition = defineSystemMcp({
  id: "user-interaction",
  name: "User Interaction",
  instruction:
    "Use ask_user only for missing information or a user-owned decision that cannot be inferred safely. " +
    "Ask one clear multiple-choice question with meaningful options.",
  emoji: "💬",
});
