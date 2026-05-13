import { defineSystemMcp } from "../system-definition.js";

export const skillDefinition = defineSystemMcp({
  id: "skill",
  name: "Skill",
  emoji: "📚",
  instruction: [
    "Use Skill to load a listed skill before following its workflow.",
    "Use CreateSkill when the user wants a reusable local skill created or rewritten.",
    "If the user asks for a skill create or rewrite and `create-skill` is listed in <skills_catalog>, load it first.",
    "Use the exact skill id from <skills_catalog>.",
    "Do not call Skill for skills that are not listed.",
    "Do not reload a skill that is already present in the conversation unless context was lost.",
    "After Skill returns, follow the injected <skill_context> while still obeying the current mode and tool permissions.",
    "With CreateSkill, provide only name, description, and instruction. The tool writes the bundle format for you.",
    "CreateSkill only writes the bundle. Load the new skill separately with Skill if you want to use it immediately.",
  ].join(" "),
});
