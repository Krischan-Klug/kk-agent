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
    "Claude Default",
    "Claude-style default agent for coding, investigation, and technical task work.",
    "edit",
    "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
  );
}

export function getBundledAgents(): AgentDefinition[] {
  return [
    getDefaultAgent(),
    buildAgent(
      "krikinator",
      "Direct Agent",
      "Lean general-purpose agent for fast direct execution.",
      "edit",
      "qwen3.5-35b-a3b-uncensored-hauhaucs-aggressive",
      10,
    ),
    buildAgent(
      "coding-agent",
      "Claude Coding Agent",
      "Claude-style coding agent with explicit plan and edit modes.",
      "edit",
      "qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
      50,
    ),
  ];
}
