import type { AgentDefinition } from "../types.js";

export const DEFAULT_AGENT: AgentDefinition = {
  id: "general-assistant",
  name: "General Assistant",
  description: "Ein allgemeiner Assistent ohne spezielle Phasen - verhaelt sich wie ein einfacher Agent-Loop.",
  loopStrategy: {
    initialPhase: "respond",
    maxTotalIterations: 10,
    phases: [
      {
        name: "respond",
        description: "Beantworte die Anfrage und nutze Tools nach Bedarf.",
        maxIterations: 10,
        transitions: [],
        autoAdvance: true,
      },
    ],
  },
  promptTemplates: {
    base: "Du bist ein hilfreicher Assistent.",
    phases: {},
  },
  mcpIds: [],
  mcpInstructions: {},
  variables: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
