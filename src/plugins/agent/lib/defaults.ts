import type { AgentDefinition } from "../types.js";
import { getDefaults } from "../../lib/defaults.js";

export function getDefaultAgent(): AgentDefinition {
  const d = getDefaults();
  return {
    id: "general-assistant",
    name: "General Assistant",
    description: "Ein allgemeiner Assistent mit einfachem Iterations-Loop.",
    systemPrompt: d.agent.systemPrompt,
    maxIterations: d.agent.maxIterations,
    loopMode: d.agent.loopMode,
    phasePrompts: {},
    mcpIds: [],
    mcpInstructions: {},
    variables: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
