import type { AgentDefinition, ModeBehavior, ReasoningEffort } from "../types.js";
import { getDefaults } from "../../lib/defaults.js";
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
    llmRequestConfig: {
      common: {
        reasoningEffort: getDefaults().reasoning.defaultEffort as ReasoningEffort /* validated at runtime by caller */,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function getDefaultAgent(): AgentDefinition {
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
