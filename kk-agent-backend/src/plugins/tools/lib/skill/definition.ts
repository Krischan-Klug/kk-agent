import type { McpServerConfig } from "../../../mcp/types.js";

export const skillDefinition: McpServerConfig = {
  id: "skill",
  name: "Skill",
  emoji: "📚",
  active: true,
  instruction: [
    "Use Skill to load a skill from <skills_catalog> when the user's request clearly matches that skill's description or workflow.",
    "Use CreateSkill to create a new local skill bundle in state/skills when the user wants a reusable skill.",
    "If the user asks to create or rewrite a skill and `create-skill` is listed in <skills_catalog>, load `create-skill` with Skill before you do anything else for that request.",
    "When creating or rewriting a skill through the agent workflow, use CreateSkill instead of manually writing SKILL.md or kk-agent.skill.json.",
    "When a listed skill clearly matches the task, call Skill before you rely on that workflow.",
    "Use the exact skill id from <skills_catalog>.",
    "Do not mention or assume a skill without loading it.",
    "Do not call Skill for skills that are not listed.",
    "Do not reload a skill that is already present in the conversation unless context was lost.",
    "After Skill returns, follow the injected <skill_context> instructions while still obeying the current mode and all tool permissions.",
    "With CreateSkill, focus on the content fields only. The tool handles SKILL.md serialization, YAML frontmatter layout, skill id generation, and kk-agent.skill.json metadata writing.",
    "CreateSkill only writes the bundle. Load the new skill explicitly with Skill if you want to use it immediately.",
  ].join(" "),
  source: "system",
  systemKey: "skill",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
