import type { CreateSessionBody, SessionState } from "../types.js";
import type { ReasoningLevelConfig } from "../../provider/types.js";
import { REASONING_LEVEL_DEFAULTS } from "../../provider/defaults.js";
import { normalizeCanonicalReasoningLevel } from "../../provider/lib/capabilities.js";
import { getDefaults } from "../../lib/defaults.js";
import { getModelSettings, resolveProviderModel } from "../../provider/service.js";
import { resolveSessionMcpIds, resolveSessionSkillIds, resolveSessionToolIds } from "./tool-selection.js";
import type { AgentDefinition } from "../../agent/types.js";

type SessionLikeAgent = Pick<
  AgentDefinition,
  "defaultModel" | "defaultChatMode" | "modeConfigs" | "reasoningEffort" | "temperature"
>;

export async function resolveSessionDefaults(
  agent: SessionLikeAgent,
  body: Pick<CreateSessionBody, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "activeMode" | "model" | "reasoningEffort" | "temperature">,
  providerId: string,
) {
  const selection = await resolveProviderModel(providerId, body.model ?? agent.defaultModel);
  return {
    providerId: selection.providerId,
    model: selection.model,
    activeMode: body.activeMode ?? agent.defaultChatMode ?? getDefaults().agent.defaultChatMode,
    activeToolIds: resolveSessionToolIds(agent, body.activeToolIds),
    activeMcpIds: resolveSessionMcpIds(agent, body.activeMcpIds),
    activeSkillIds: resolveSessionSkillIds(agent, body.activeSkillIds),
    reasoningEffort: normalizeCanonicalReasoningLevel(body.reasoningEffort ?? agent.reasoningEffort),
    temperature: body.temperature ?? agent.temperature,
  };
}

export function resolveReasoningConfig(session: SessionState): {
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
} {
  const modelSettings = getModelSettings(session.providerId, session.model);
  const effort = normalizeCanonicalReasoningLevel(
    session.reasoningEffort ?? modelSettings.reasoningEffort ?? getDefaults().reasoning.defaultEffort,
  );
  const levelConfig: ReasoningLevelConfig | undefined = effort ? modelSettings.levels?.[effort] : undefined;
  const defaults = effort ? REASONING_LEVEL_DEFAULTS[effort] : undefined;

  return {
    reasoningEffort: effort,
    temperature: session.temperature ?? levelConfig?.temperature ?? defaults?.temperature,
    maxOutputTokens: levelConfig?.maxOutputTokens ?? defaults?.maxOutputTokens,
  };
}
