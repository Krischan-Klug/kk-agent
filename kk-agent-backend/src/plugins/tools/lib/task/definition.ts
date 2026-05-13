import { defineSystemMcp } from "../system-definition.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const taskDefinition = defineSystemMcp({
  id: "task",
  name: "Tasks",
  instruction:
    "Use create_tasks and update_tasks when explicit task tracking will materially help structure the work. " +
    "Keep tasks small, concrete, and tied to the current user request. " +
    "Use solve_tasks as the only way to mark tasks as completed. " +
    "Use the exact task ids shown in the current task context or task tool results when updating or solving tasks. " +
    "Do not use the task tool for long notes, scratch thinking, or final reports.",
  emoji: "📝",
});
