import type { EndpointType, ModelInfo, ModelSettings, ReasoningLevelConfig } from "@/types/api";

export const DEFAULT_REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export const DEFAULT_REASONING_LEVEL_DEFAULTS: Record<string, ReasoningLevelConfig> = {
  none: { temperature: 1.0 },
  minimal: { temperature: 1.0, maxOutputTokens: 2048 },
  low: { temperature: 1.0, maxOutputTokens: 4096 },
  medium: { temperature: 1.0, maxOutputTokens: 8192 },
  high: { temperature: 1.0, maxOutputTokens: 16384 },
  xhigh: { temperature: 1.0 },
};

export function getReasoningLevels(modelInfo?: ModelInfo): string[] {
  if (!modelInfo?.capabilities.supportsReasoning) return [];
  return [...DEFAULT_REASONING_LEVELS];
}

export function normalizeCanonicalReasoningEffort(value?: string): string | undefined {
  if (!value) return undefined;
  if (value === "off") return "none";
  if (value === "on") return "high";
  return value;
}

export function getResolvedEndpoint(modelInfo: ModelInfo | undefined, settings?: ModelSettings): EndpointType {
  const supported = (modelInfo?.capabilities.supportedEndpoints ?? ["chat-completions"])
    .filter((endpoint) => modelInfo?.capabilities.transportProfiles?.[endpoint]?.supported !== false);
  if (settings?.endpoint && supported.includes(settings.endpoint)) return settings.endpoint;
  return supported[0] ?? "chat-completions";
}

export function getEndpointCapabilities(modelInfo: ModelInfo | undefined, endpoint: EndpointType) {
  return modelInfo?.capabilities.endpointCapabilities[endpoint] ?? {
    temperatureSupported: false,
    maxOutputTokensSupported: false,
  };
}

export function getResolvedReasoningEffort(modelInfo: ModelInfo | undefined, settings: ModelSettings | undefined, value?: string): string {
  const levels = getReasoningLevels(modelInfo);
  const normalizedValue = normalizeCanonicalReasoningEffort(value);
  const normalizedSetting = normalizeCanonicalReasoningEffort(settings?.reasoningEffort);
  if (levels.length === 0) return normalizedValue ?? normalizedSetting ?? "medium";
  if (normalizedValue && levels.includes(normalizedValue)) return normalizedValue;
  if (normalizedSetting && levels.includes(normalizedSetting)) return normalizedSetting;
  if (levels.includes("medium")) return "medium";
  return levels[0];
}

export function getDefaultLevelConfig(level: string): ReasoningLevelConfig | undefined {
  return DEFAULT_REASONING_LEVEL_DEFAULTS[level];
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
