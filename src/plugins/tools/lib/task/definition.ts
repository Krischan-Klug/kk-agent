import type { McpServerConfig } from "../../../mcp/types.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const taskDefinition: McpServerConfig = {
  id: "task",
  name: "Tasks",
  active: true,
  instruction:
    "Use create_tasks to create or replace the current session task list using title and notes. " +
    "Use update_tasks only to change title or notes of existing tasks. " +
    "Use solve_tasks as the only way to mark tasks as completed. " +
    "Use the exact task ids shown in the current task context or in task tool results when updating or solving tasks. " +
    "Keep tasks small, concrete, and tied to the current user request. " +
    "Do not use the task tool for long notes or final reports.",
  emoji: "📝",
  source: "system",
  systemKey: "task",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
