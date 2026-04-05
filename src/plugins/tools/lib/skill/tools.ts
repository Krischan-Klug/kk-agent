import type { McpToolDefinition } from "../../../mcp/types.js";

export const skillTools: McpToolDefinition[] = [
  {
    name: "Skill",
    description: "Load a registered skill from <skills_catalog> into the conversation before following its workflow.",
    inputSchema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "Exact skill id from <skills_catalog> to load.",
        },
      },
      required: ["skill"],
    },
    mcpId: "skill",
  },
];
