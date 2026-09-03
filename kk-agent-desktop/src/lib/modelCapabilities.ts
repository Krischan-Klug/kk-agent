import {
  getReasoningLevels as getSharedReasoningLevels,
  normalizeCanonicalReasoningLevel,
} from "kk-agent-contract";
import type { ModelInfo, ModelSettings, ReasoningEffort } from "kk-agent-contract";

export function getReasoningLevels(modelInfo?: ModelInfo): ReasoningEffort[] {
  return getSharedReasoningLevels(modelInfo?.capabilities);
}

export function normalizeCanonicalReasoningEffort(value?: string): ReasoningEffort | undefined {
  return normalizeCanonicalReasoningLevel(value);
}

export function getResolvedReasoningEffort(
  modelInfo: ModelInfo | undefined,
  settings: ModelSettings | undefined,
  value?: string,
): ReasoningEffort | undefined {
  const levels = getReasoningLevels(modelInfo);
  const normalizedValue = normalizeCanonicalReasoningEffort(value);
  const normalizedSetting = normalizeCanonicalReasoningEffort(settings?.llmRequestConfig?.reasoning?.effort);
  if (normalizedValue && levels.includes(normalizedValue)) return normalizedValue;
  if (normalizedSetting && levels.includes(normalizedSetting)) return normalizedSetting;
  const declaredDefault = modelInfo?.capabilities?.reasoning.defaultEffort;
  if (declaredDefault && levels.includes(declaredDefault)) return declaredDefault;
  return levels[0];
}
