import type { CreateSessionBody, SessionState } from "../types.js";
import type { ReasoningLevelConfig } from "../../provider/types.js";
import { REASONING_LEVEL_DEFAULTS } from "../../provider/defaults.js";
import { getDefaults } from "../../lib/defaults.js";
import { getModelSettings, resolveProviderModel } from "../../provider/service.js";
import { resolveSessionMcpIds, resolveSessionToolIds } from "./tool-selection.js";

type SessionLikeAgent = {
  defaultModel?: string;
  toolIds?: string[];
  mcpIds?: string[];
  reasoningEffort?: string;
  temperature?: number;
};

export async function resolveSessionDefaults(
  agent: SessionLikeAgent,
  body: Pick<CreateSessionBody, "activeToolIds" | "activeMcpIds" | "model" | "reasoningEffort" | "temperature">,
  providerId: string,
) {
  const selection = await resolveProviderModel(providerId, body.model ?? agent.defaultModel);
  return {
    providerId: selection.providerId,
    model: selection.model,
    activeToolIds: resolveSessionToolIds(agent, body.activeToolIds),
    activeMcpIds: resolveSessionMcpIds(agent, body.activeMcpIds),
    reasoningEffort: body.reasoningEffort ?? agent.reasoningEffort,
    temperature: body.temperature ?? agent.temperature,
  };
}

export function resolveReasoningConfig(session: SessionState): {
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
} {
  const modelSettings = getModelSettings(session.providerId, session.model);
  const effort = session.reasoningEffort ?? modelSettings.reasoningEffort ?? getDefaults().reasoning.defaultEffort;
  const levelConfig: ReasoningLevelConfig | undefined = modelSettings.levels?.[effort];
  const defaults = REASONING_LEVEL_DEFAULTS[effort];

  return {
    reasoningEffort: effort,
    temperature: session.temperature ?? levelConfig?.temperature ?? defaults?.temperature,
    maxOutputTokens: levelConfig?.maxOutputTokens ?? defaults?.maxOutputTokens,
  };
}
