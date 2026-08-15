import type {
  LlmRequestConfig,
  ModelSettings,
  ReasoningConfig,
  SamplingOverrides,
} from "./provider.js";
import { normalizeCanonicalReasoningLevel } from "./capabilities.js";

function compactReasoning(value: ReasoningConfig | undefined): ReasoningConfig | undefined {
  if (!value) return undefined;
  const reasoning: ReasoningConfig = {};
  if (value.effort !== undefined) reasoning.effort = value.effort;
  if (value.history !== undefined) reasoning.history = value.history;
  return Object.keys(reasoning).length > 0 ? reasoning : undefined;
}

function compactSampling(value: SamplingOverrides | undefined): SamplingOverrides | undefined {
  if (!value) return undefined;
  const sampling: SamplingOverrides = {};
  if (value.temperature !== undefined) sampling.temperature = value.temperature;
  if (value.topP !== undefined) sampling.topP = value.topP;
  return Object.keys(sampling).length > 0 ? sampling : undefined;
}

export function mergeLlmRequestConfigs(
  ...configs: Array<LlmRequestConfig | undefined>
): LlmRequestConfig | undefined {
  const reasoning: ReasoningConfig = {};
  const sampling: SamplingOverrides = {};
  for (const config of configs) {
    if (!config) continue;
    if (Object.prototype.hasOwnProperty.call(config.reasoning ?? {}, "effort")) reasoning.effort = config.reasoning?.effort;
    if (Object.prototype.hasOwnProperty.call(config.reasoning ?? {}, "history")) reasoning.history = config.reasoning?.history;
    if (Object.prototype.hasOwnProperty.call(config.sampling ?? {}, "temperature")) sampling.temperature = config.sampling?.temperature;
    if (Object.prototype.hasOwnProperty.call(config.sampling ?? {}, "topP")) sampling.topP = config.sampling?.topP;
  }
  return compactLlmRequestConfig({ reasoning, sampling });
}

export function compactLlmRequestConfig(
  config?: LlmRequestConfig,
): LlmRequestConfig | undefined {
  if (!config) return undefined;
  const reasoning = compactReasoning(config.reasoning);
  const sampling = compactSampling(config.sampling);
  const compacted: LlmRequestConfig = {
    ...(reasoning ? { reasoning } : {}),
    ...(sampling ? { sampling } : {}),
  };
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

export function compactModelSettings(settings: ModelSettings): ModelSettings {
  const llmRequestConfig = compactLlmRequestConfig(settings.llmRequestConfig);
  const normalizedConfig = llmRequestConfig
    ? compactLlmRequestConfig({
      ...llmRequestConfig,
      reasoning: {
        ...llmRequestConfig.reasoning,
        effort: normalizeCanonicalReasoningLevel(llmRequestConfig.reasoning?.effort),
      },
    })
    : undefined;
  return {
    ...(settings.profileId ? { profileId: settings.profileId } : {}),
    ...(normalizedConfig ? { llmRequestConfig: normalizedConfig } : {}),
  };
}
