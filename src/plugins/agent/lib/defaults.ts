import type { AgentDefinition, ChatMode, ReasoningEffort } from "../types.js";
import { getDefaults } from "../../lib/defaults.js";
import { compactModeConfigs, normalizeModeConfigs } from "./mode-config.js";

function buildAgent(
  id: string,
  name: string,
  description: string,
  defaultChatMode: ChatMode,
  defaultModel?: string,
): AgentDefinition {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    defaultChatMode,
    modeConfigs: compactModeConfigs(
      normalizeModeConfigs(),
    ) as AgentDefinition["modeConfigs"],
    variables: {},
    defaultModel,
    llmRequestConfig: {
      common: {
        reasoningEffort: getDefaults().reasoning.defaultEffort as ReasoningEffort,
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
