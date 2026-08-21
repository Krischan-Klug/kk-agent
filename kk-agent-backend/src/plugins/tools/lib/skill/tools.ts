import type { McpToolDefinition } from "../../../mcp/types.js";

export const skillTools: McpToolDefinition[] = [
  {
    name: "Skill",
    description: "Load one listed Agent Skill.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact skill name from <available_skills>.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    mcpId: "skill",
  },
];
