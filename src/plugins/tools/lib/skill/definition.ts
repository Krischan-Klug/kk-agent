import type { McpServerConfig } from "../../../mcp/types.js";

export const skillDefinition: McpServerConfig = {
  id: "skill",
  name: "Skill",
  active: true,
  instruction: [
    "Use Skill to load a skill from <skills_catalog> when the user's request clearly matches that skill's description or workflow.",
    "Call Skill before you rely on a listed skill's workflow.",
    "Use the exact skill id from <skills_catalog>.",
    "Do not mention or assume a skill without loading it.",
    "Do not call Skill for skills that are not listed.",
    "Do not reload a skill that is already present in the conversation unless context was lost.",
    "After Skill returns, follow the injected <skill_context> instructions while still obeying the current mode and all tool permissions.",
  ].join(" "),
  source: "system",
  systemKey: "skill",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
