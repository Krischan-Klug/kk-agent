import type { AgentDefinition } from "../types.js";
import { getDefaults } from "../../lib/defaults.js";

export function getDefaultAgent(): AgentDefinition {
  const d = getDefaults();
  return {
    id: "general-assistant",
    name: "Swagos",
    description: "Ein allgemeiner Assistent ohne spezielle Phasen.",
    systemPrompt: d.agent.systemPrompt,
    maxIterations: d.agent.maxIterations,
    loopMode: d.agent.loopMode,
    phasePrompts: {},
    mcpIds: ["filesystem", "web-search", "terminal", "user-interaction", "task", "memory"],
    mcpInstructions: {},
    variables: {},
    defaultModel: "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
