import type { CreateSkillBody } from "../types.js";

export const DEFAULT_CREATE_SKILL_ID = "create-skill";

export const DEFAULT_CREATE_SKILL_BODY: CreateSkillBody = {
  name: "Create Skill",
  description: "Create or rewrite a reusable local skill in state/skills. Use when the user wants a repeatable workflow packaged as a standard skill bundle.",
  instruction: [
    "Treat skills as reusable instruction bundles.",
    "If `create-skill` is listed in <skills_catalog> and the user wants a skill created or rewritten, load it first with Skill.",
    "Use CreateSkill for create or rewrite requests unless the user explicitly asks for direct file edits.",
    "Provide only name, description, and instruction.",
    "Keep the bundle minimal and standard: one SKILL.md with YAML frontmatter for name and description.",
    "Write the description as one sentence that says what the skill does and when to use it.",
    "Write the instruction as short imperative markdown with only workflow-specific steps.",
    "Load the new skill with Skill if the user wants to use it immediately after creation.",
  ].join("\n"),
};
