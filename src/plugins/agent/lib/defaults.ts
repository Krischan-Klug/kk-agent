import type { AgentDefinition } from "../types.js";

export const DEFAULT_AGENT: AgentDefinition = {
  id: "general-assistant",
  name: "General Assistant",
  description: "Ein allgemeiner Assistent mit einfachem Iterations-Loop.",
  systemPrompt: "Du bist ein hilfreicher Assistent.",
  maxIterations: 10,
  mcpIds: [],
  mcpInstructions: {},
  variables: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
