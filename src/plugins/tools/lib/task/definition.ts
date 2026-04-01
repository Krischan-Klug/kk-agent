import type { McpServerConfig } from "../../../mcp/types.js";

export const taskDefinition: McpServerConfig = {
  id: "task",
  name: "Tasks",
  active: true,
  instruction:
    [
      "Use update_tasks to keep a small structured task list for the current session.",
      "Prefer this for multi-step work, plans, and progress tracking.",
      "Keep tasks concrete and update their status as work progresses.",
    ].join(" "),
  emoji: "📝",
  source: "system",
  systemKey: "task",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
