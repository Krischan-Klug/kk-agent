import type { ModelSettings } from "../types.js";
import { compactLlmRequestConfig, compactModelSettings, normalizeCanonicalReasoningLevel } from "kk-agent-contract";

export function getModelSettingsKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export function normalizeStoredModelSettings(settings: ModelSettings | undefined): ModelSettings {
  const storedConfig = settings?.llmRequestConfig;
  const normalizedReasoningEffort = normalizeCanonicalReasoningLevel(storedConfig?.reasoning?.effort);

  return compactModelSettings({
    profileId: settings?.profileId,
    contextLimit: settings?.contextLimit,
    llmRequestConfig: compactLlmRequestConfig({
      reasoning: {
        effort: normalizedReasoningEffort,
        history: storedConfig?.reasoning?.history,
      },
      sampling: {
        temperature: storedConfig?.sampling?.temperature,
        topP: storedConfig?.sampling?.topP,
      },
    }),
  });
}
