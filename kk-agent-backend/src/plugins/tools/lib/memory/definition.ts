import { defineSystemMcp } from "../system-definition.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const memoryDefinition = defineSystemMcp({
  id: "memory",
  name: "Memory",
  instruction:
    "Use remember_facts sparingly for short session facts or durable user preferences that are likely to matter again later. " +
    "Prefer concise factual memory over summaries. " +
    "Do not store transient tool output, large notes, or scratchpad content as memory.",
  emoji: "🧠",
});
