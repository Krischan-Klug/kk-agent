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
    description: "Create a new local skill bundle in state/skills. Provide the content fields and metadata only; the tool writes a valid KK-Agent SKILL.md bundle with YAML frontmatter and optional kk-agent.skill.json metadata.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable skill name only. Do not include YAML keys or file formatting. The skill id is generated automatically from this name.",
        },
        description: {
          type: "string",
          description: "Trigger-oriented skill description only. Do not include `description:` prefixes, YAML quoting, or trigger mini-syntax; the tool serializes frontmatter safely.",
        },
        instruction: {
          type: "string",
          description: "Lean instruction body only. Do not include frontmatter, opening `---`, or file scaffolding; the tool writes the final SKILL.md format.",
        },
        active: {
          type: "boolean",
          description: "Whether the new skill should be active immediately. Defaults to true.",
        },
        allowedModeBehaviors: {
          type: "array",
          description: "Mode behaviors where the skill may be used. Defaults to plan and edit when omitted.",
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
