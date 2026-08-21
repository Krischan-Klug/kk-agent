import { defineSystemMcp } from "../system-definition.js";

export const skillDefinition = defineSystemMcp({
  id: "skill",
  name: "Skill",
  emoji: "📚",
  instruction: [
    "Load a matching skill by its exact name before following its workflow.",
    "Resolve relative paths against the skill_directory returned with the loaded instructions.",
    "Do not invent names or reload an already loaded skill.",
  ].join(" "),
});
