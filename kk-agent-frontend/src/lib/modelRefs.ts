import type { ModelInfo, ProviderConfig } from "@/types/api";

const MODEL_REF_SEPARATOR = "::";

export function toModelRef(model: Pick<ModelInfo, "providerId" | "id">): string {
  return `${model.providerId}${MODEL_REF_SEPARATOR}${model.id}`;
}

export function makeModelRef(providerId: string, modelId: string): string {
  return `${providerId}${MODEL_REF_SEPARATOR}${modelId}`;
}

export function parseModelRef(value: string): { providerId: string; modelId: string } | null {
  const separatorIndex = value.indexOf(MODEL_REF_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const providerId = value.slice(0, separatorIndex);
  const modelId = value.slice(separatorIndex + MODEL_REF_SEPARATOR.length);
  return providerId && modelId ? { providerId, modelId } : null;
}

export function getSessionModelRef(session: { providerId: string; model: string }): string {
  return makeModelRef(session.providerId, session.model);
}

export function getAgentModelRef(agent: { defaultProviderId?: string; defaultModel?: string }): string {
  return agent.defaultProviderId && agent.defaultModel
    ? makeModelRef(agent.defaultProviderId, agent.defaultModel)
    : "";
}

export function getModelLabel(model: Pick<ModelInfo, "providerId" | "id">, providers: Pick<ProviderConfig, "id" | "name">[]): string {
  const providerName = providers.find((provider) => provider.id === model.providerId)?.name ?? model.providerId;
  return `${model.id} - ${providerName}`;
}
