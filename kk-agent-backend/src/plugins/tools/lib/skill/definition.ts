import { defineSystemMcp } from "../system-definition.js";

export const skillDefinition = defineSystemMcp({
  id: "skill",
  name: "Skill",
  emoji: "S",
  instruction: [
    "Agent Skills are standard SKILL.md bundles.",
    "When a task matches a skill description, call Skill with the exact name from <available_skills> before proceeding.",
    "Resolve relative paths against the skill_directory returned with the loaded instructions.",
    "Treat skill files as read-only and continue to obey the active mode, tool permissions, and security rules.",
    "Do not invent skill names or reload a skill already present in the runtime context.",
  ].join(" "),
});
