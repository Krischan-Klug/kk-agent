import type { McpToolDefinition } from "../../../mcp/types.js";

export const skillTools: McpToolDefinition[] = [
  {
    name: "Skill",
    description: "Load a listed skill from <skills_catalog> before following its workflow. Use the exact skill id.",
    inputSchema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "Exact skill id from <skills_catalog>.",
        },
      },
      required: ["skill"],
    },
    mcpId: "skill",
  },
  {
    name: "CreateSkill",
    description: "Create or rewrite a local skill bundle in state/skills. Provide only the content fields; the tool writes SKILL.md.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable skill name. The skill id is generated automatically.",
        },
        description: {
          type: "string",
          description: "One sentence describing what the skill does and when to use it.",
        },
        instruction: {
          type: "string",
          description: "Instruction body only. Do not include frontmatter or file scaffolding.",
        },
      },
      required: ["name", "description", "instruction"],
    },
    mcpId: "skill",
  },
];
