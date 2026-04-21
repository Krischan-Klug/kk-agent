import type { CreateSessionBody, SessionState } from "../types.js";
import {
  compactLlmRequestConfig,
  mergeLlmRequestConfigs,
} from "../../provider/lib/request-config.js";
import { getDefaults } from "../../lib/defaults.js";
import { resolveProviderModel } from "../../provider/service.js";
import { resolveSessionMcpIds, resolveSessionSkillIds, resolveSessionToolIds } from "./tool-selection.js";
import type { AgentDefinition } from "../../agent/types.js";

type SessionLikeAgent = Pick<
  AgentDefinition,
  "defaultProviderId" | "defaultModel" | "defaultChatMode" | "modeConfigs" | "llmRequestConfig"
>;

export async function resolveSessionDefaults(
  agent: SessionLikeAgent,
  body: Pick<CreateSessionBody, "providerId" | "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "activeMode" | "model" | "llmRequestConfig">,
  currentProviderId?: string,
) {
  const selection = await resolveProviderModel(
    body.providerId ?? agent.defaultProviderId ?? currentProviderId,
    body.model ?? agent.defaultModel,
  );
  const llmRequestConfig = compactLlmRequestConfig(mergeLlmRequestConfigs(
    agent.llmRequestConfig,
    body.llmRequestConfig,
  ));
  return {
    providerId: selection.providerId,
    model: selection.model,
    activeMode: body.activeMode ?? agent.defaultChatMode ?? getDefaults().agent.defaultChatMode,
    activeToolIds: resolveSessionToolIds(agent, body.activeToolIds),
    activeMcpIds: resolveSessionMcpIds(agent, body.activeMcpIds),
    activeSkillIds: resolveSessionSkillIds(agent, body.activeSkillIds),
    llmRequestConfig,
  };
}

export function resolveSessionLlmRequestConfig(session: SessionState): SessionState["llmRequestConfig"] {
  return compactLlmRequestConfig(session.llmRequestConfig);
}
