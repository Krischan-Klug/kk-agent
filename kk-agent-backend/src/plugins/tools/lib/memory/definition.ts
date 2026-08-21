import { defineSystemMcp } from "../system-definition.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const memoryDefinition = defineSystemMcp({
  id: "memory",
  name: "Memory",
  instruction:
    "Store only concise session facts or durable user preferences likely to matter again. " +
    "Do not store summaries, transient output, or scratch notes.",
  emoji: "🧠",
});
