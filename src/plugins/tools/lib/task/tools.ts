import type { McpToolDefinition } from "../../../mcp/types.js";

export const taskTools: McpToolDefinition[] = [
  {
    name: "update_tasks",
    description: "Create or replace the current session task list with structured progress items.",
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              notes: { type: "string" },
            },
            required: ["title", "status"],
          },
        },
      },
      required: ["tasks"],
    },
    mcpId: "task",
  },
];
