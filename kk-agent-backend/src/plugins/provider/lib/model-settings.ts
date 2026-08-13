import type { ModelSettings } from "../types.js";
import { compactLlmRequestConfig, compactModelSettings, normalizeCanonicalReasoningLevel } from "kk-agent-contract";

export function getModelSettingsKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export function normalizeStoredModelSettings(settings: ModelSettings | undefined): ModelSettings {
  const storedConfig = settings?.llmRequestConfig;
  const normalizedReasoningEffort = normalizeCanonicalReasoningLevel(storedConfig?.common?.reasoningEffort);

  return compactModelSettings({
    llmRequestConfig: compactLlmRequestConfig({
      common: {
        endpoint: storedConfig?.common?.endpoint,
        reasoningEffort: normalizedReasoningEffort,
        temperature: storedConfig?.common?.temperature,
        topP: storedConfig?.common?.topP,
      },
    }),
  });
}
