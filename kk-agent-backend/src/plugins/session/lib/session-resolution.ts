import type { CreateSessionBody, SessionState } from "../types.js";
import {
  compactLlmRequestConfig,
  mergeLlmRequestConfigs,
} from "../../provider/lib/request-config.js";
import { resolveProviderModel } from "../../provider/service.js";
import { resolveSessionMcpIds, resolveSessionSkillIds, resolveSessionToolIds } from "./tool-selection.js";
import type { AgentDefinition } from "../../agent/types.js";
import { getEnabledAgentModes, resolveDefaultModeId } from "../../agent/lib/mode-config.js";

type SessionLikeAgent = Pick<
  AgentDefinition,
  "defaultProviderId" | "defaultModel" | "defaultModeId" | "modes" | "llmRequestConfig"
>;

function resolveSessionModeId(agent: SessionLikeAgent, requestedModeId?: string): string {
  const enabledModes = getEnabledAgentModes(agent);
  return resolveDefaultModeId(requestedModeId ?? agent.defaultModeId, enabledModes);
}

export async function resolveSessionDefaults(
  agent: SessionLikeAgent,
  body: Pick<CreateSessionBody, "providerId" | "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "activeModeId" | "model" | "llmRequestConfig">,
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
    activeModeId: resolveSessionModeId(agent, body.activeModeId),
    activeToolIds: resolveSessionToolIds(agent, body.activeToolIds),
    activeMcpIds: resolveSessionMcpIds(agent, body.activeMcpIds),
    activeSkillIds: resolveSessionSkillIds(agent, body.activeSkillIds),
    llmRequestConfig,
  };
}

export function resolveSessionLlmRequestConfig(session: SessionState): SessionState["llmRequestConfig"] {
  return compactLlmRequestConfig(session.llmRequestConfig);
}
