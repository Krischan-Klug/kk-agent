import { defineInternalTool } from "../internal-tool-definition.js";

// Base capability guidance only; agent prompt policy owns workflow rules.
export const taskDefinition = defineInternalTool({
  id: "task",
  name: "Tasks",
  instruction:
    "Use task tracking only when it materially improves multi-step or multi-turn work. " +
    "Keep existing tasks aligned with the current request and complete a task only after its work is done.",
  emoji: "📝",
});
