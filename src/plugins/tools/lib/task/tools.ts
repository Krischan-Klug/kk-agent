import type { McpToolDefinition } from "../../../mcp/types.js";

export const taskTools: McpToolDefinition[] = [
  {
    name: "create_tasks",
    description: "Create or replace the current session task list using only task title and description.",
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              notes: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
      required: ["tasks"],
    },
    mcpId: "task",
  },
  {
    name: "update_tasks",
    description: "Update title and description of existing tasks without changing completion state.",
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
              notes: { type: "string" },
            },
            required: ["id"],
          },
        },
      },
      required: ["tasks"],
    },
    mcpId: "task",
  },
  {
    name: "solve_tasks",
    description: "Mark one or more existing tasks as completed.",
    inputSchema: {
      type: "object",
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["taskIds"],
    },
    mcpId: "task",
  },
];
