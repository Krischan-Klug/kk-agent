import { defineInternalTool } from "../internal-tool-definition.js";

// Base capability guidance only; agent prompt policy owns workflow rules.
export const memoryDefinition = defineInternalTool({
  id: "memory",
  name: "Memory",
  instruction:
    "Store only concise session facts or durable user preferences likely to matter again. " +
    "Do not store summaries, transient output, or scratch notes.",
  emoji: "🧠",
});
