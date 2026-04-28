import type { ModelSettings } from "../types.js";
import { normalizeCanonicalReasoningLevel } from "./capabilities.js";
import { compactLlmRequestConfig, compactModelSettings } from "./request-config.js";

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
        maxOutputTokens: storedConfig?.common?.maxOutputTokens,
      },
      extraBody: storedConfig?.extraBody,
    }),
  });
}
