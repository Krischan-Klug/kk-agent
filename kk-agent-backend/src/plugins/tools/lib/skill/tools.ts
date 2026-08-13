import type { McpToolDefinition } from "../../../mcp/types.js";

export const skillTools: McpToolDefinition[] = [
  {
    name: "Skill",
    description: "Load one Agent Skill from <available_skills> before following its workflow.",
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
