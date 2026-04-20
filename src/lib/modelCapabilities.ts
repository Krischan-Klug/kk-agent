import {
  getEndpointCapabilities as getSharedEndpointCapabilities,
  getPreferredEndpoint,
  getReasoningLevels as getSharedReasoningLevels,
  normalizeCanonicalReasoningLevel,
} from "kk-agent-contract";
import type { EndpointType, ModelInfo, ModelSettings, ReasoningEffort } from "@/types/api";

export function getReasoningLevels(modelInfo?: ModelInfo): ReasoningEffort[] {
  return getSharedReasoningLevels(modelInfo?.capabilities);
}

export function normalizeCanonicalReasoningEffort(value?: string): ReasoningEffort | undefined {
  return normalizeCanonicalReasoningLevel(value);
}

export function getResolvedEndpoint(modelInfo: ModelInfo | undefined, settings?: ModelSettings): EndpointType {
  const configuredEndpoint = settings?.llmRequestConfig?.common?.endpoint;
  return getPreferredEndpoint(modelInfo?.capabilities, configuredEndpoint);
}

export function getEndpointCapabilities(modelInfo: ModelInfo | undefined, endpoint: EndpointType) {
  return getSharedEndpointCapabilities(modelInfo?.capabilities, endpoint);
}

export function getResolvedReasoningEffort(
  modelInfo: ModelInfo | undefined,
  settings: ModelSettings | undefined,
  value?: string,
): ReasoningEffort | undefined {
  const levels = getReasoningLevels(modelInfo);
  const normalizedValue = normalizeCanonicalReasoningEffort(value);
  const normalizedSetting = normalizeCanonicalReasoningEffort(settings?.llmRequestConfig?.common?.reasoningEffort);
  if (normalizedValue && levels.includes(normalizedValue)) return normalizedValue;
  if (normalizedSetting && levels.includes(normalizedSetting)) return normalizedSetting;
  if (levels.includes("medium")) return "medium";
  return levels[0];
}

export function buildTemperatureOptions(range?: { min: number; max: number; step?: number }) {
  if (!range) return [];
  const step = range.step ?? 0.1;
  const options: Array<{ value: string; label: string }> = [];
  for (let value = range.min; value <= range.max + 1e-9; value += step) {
    const normalized = Number(value.toFixed(6)).toFixed(step >= 1 ? 0 : 1);
    options.push({ value: normalized, label: normalized });
  }
  return options;
}

export function buildMaxOutputOptions(range?: { min: number; max: number; step?: number }, preferred?: number) {
  if (!range) return [];
  const candidates = new Set<number>([
    range.min,
    preferred ?? -1,
    512,
    1024,
    2048,
    4096,
    8192,
    16384,
    32768,
    65536,
    range.max,
  ]);

  return [...candidates]
    .filter((value) => value >= range.min && value <= range.max)
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), label: value.toLocaleString() }));
}
