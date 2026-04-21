import type { McpToolDefinition } from "../../../mcp/types.js";

export const skillTools: McpToolDefinition[] = [
  {
    name: "Skill",
    description: "Load a registered skill from <skills_catalog> into the conversation before following its workflow. Use the exact skill id.",
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
  {
    name: "CreateSkill",
    description: "Create a new local skill bundle in state/skills. Use for reusable skills, not one-off task notes.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable skill name. The skill id is generated automatically from this name.",
        },
        description: {
          type: "string",
          description: "Trigger-oriented frontmatter description that states what the skill does and when it should be used.",
        },
        instruction: {
          type: "string",
          description: "Lean SKILL.md body with short imperative instructions.",
        },
        active: {
          type: "boolean",
          description: "Whether the new skill should be active immediately. Defaults to true.",
        },
        allowedModes: {
          type: "array",
          description: "Modes where the skill may be used. Defaults to plan and edit when omitted.",
          items: {
            type: "string",
            enum: ["plan", "edit", "autonomous"],
          },
        },
        recommendedToolIds: {
          type: "array",
          description: "Optional internal tool ids that materially help use this skill.",
          items: {
            type: "string",
          },
        },
        recommendedMcpIds: {
          type: "array",
          description: "Optional MCP ids that materially help use this skill.",
          items: {
            type: "string",
          },
        },
      },
      required: ["name", "description", "instruction"],
    },
    mcpId: "skill",
  },
];
