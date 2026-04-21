import type { McpServerConfig } from "../../../mcp/types.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const taskDefinition: McpServerConfig = {
  id: "task",
  name: "Tasks",
  active: true,
  instruction:
    "Use create_tasks and update_tasks when explicit task tracking will materially help structure the work. " +
    "Keep tasks small, concrete, and tied to the current user request. " +
    "Use solve_tasks as the only way to mark tasks as completed. " +
    "Use the exact task ids shown in the current task context or task tool results when updating or solving tasks. " +
    "Do not use the task tool for long notes, scratch thinking, or final reports.",
  emoji: "📝",
  source: "system",
  systemKey: "task",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
