import type { AgentDefinition, ChatMode } from "../types.js";
import { getDefaults } from "../../lib/defaults.js";
import { compactModeConfigs, normalizeModeConfigs } from "./mode-config.js";

function buildAgent(
  id: string,
  name: string,
  description: string,
  defaultChatMode: ChatMode,
  defaultModel: string,
  maxIterations?: number,
): AgentDefinition {
  const defaults = getDefaults();
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    defaultChatMode,
    modeConfigs: compactModeConfigs(normalizeModeConfigs()) as AgentDefinition["modeConfigs"],
    maxIterations: maxIterations ?? defaults.agent.maxIterations,
    variables: {},
    defaultModel,
    reasoningEffort: defaults.reasoning.defaultEffort,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDefaultAgent(): AgentDefinition {
  return buildAgent(
    "general-assistant",
    "Swagos",
    "Allgemeiner Unternehmens-Agent mit manuell schaltbaren Chat-Modes.",
    "edit",
    "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
  );
}

export function getBundledAgents(): AgentDefinition[] {
  return [
    getDefaultAgent(),
    buildAgent(
      "krikinator",
      "Kirk",
      "Direkter Agent fuer schnelle manuelle Ausfuehrung.",
      "edit",
      "qwen3.5-35b-a3b-uncensored-hauhaucs-aggressive",
      10,
    ),
    buildAgent(
      "coding-agent",
      "Musti - Coding Agent",
      "Arbeitsagent mit manuell schaltbaren Modes fuer Planen und Editieren.",
      "edit",
      "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
      50,
    ),
  ];
}
