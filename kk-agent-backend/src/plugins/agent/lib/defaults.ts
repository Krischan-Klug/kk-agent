import type { AgentDefinition } from "../types.js";
import { buildDefaultAgentConfig } from "./agent-config.js";

function buildAgent(
  id: string,
  name: string,
  description: string,
  defaultModel?: string,
): AgentDefinition {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    ...buildDefaultAgentConfig(),
    variables: {},
    defaultModel,
    createdAt: now,
    updatedAt: now,
  };
}

function getDefaultAgent(): AgentDefinition {
  return buildAgent(
    "swagos",
    "Swagos",
    "Von Krischan entwickelter allgemeiner Agent fuer vielseitige Aufgaben.",
  );
}

export function getBundledAgents(): AgentDefinition[] {
  return [getDefaultAgent()];
}
