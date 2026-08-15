import type { AgentDefinition, ModeBehavior } from "../types.js";
import { buildDefaultModes, resolveDefaultModeId } from "./mode-config.js";

function buildAgent(
  id: string,
  name: string,
  description: string,
  defaultModeBehavior: ModeBehavior,
  defaultModel?: string,
): AgentDefinition {
  const now = new Date().toISOString();
  const modes = buildDefaultModes();
  return {
    id,
    name,
    description,
    defaultModeId: resolveDefaultModeId(defaultModeBehavior, modes),
    modes,
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
    "edit",
  );
}

export function getBundledAgents(): AgentDefinition[] {
  return [getDefaultAgent()];
}
