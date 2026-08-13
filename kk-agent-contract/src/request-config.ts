import type {
  CommonLlmRequestConfig,
  LlmRequestConfig,
  ModelSettings,
} from "./provider.js";
import { normalizeCanonicalReasoningLevel } from "./capabilities.js";

function compactCommon(
  value: CommonLlmRequestConfig | undefined,
): CommonLlmRequestConfig | undefined {
  if (!value) return undefined;
  const common: CommonLlmRequestConfig = {};
  if (value.endpoint !== undefined) common.endpoint = value.endpoint;
  if (value.reasoningEffort !== undefined) common.reasoningEffort = value.reasoningEffort;
  if (value.temperature !== undefined) common.temperature = value.temperature;
  if (value.topP !== undefined) common.topP = value.topP;
  return Object.keys(common).length > 0 ? common : undefined;
}

export function mergeLlmRequestConfigs(
  ...configs: Array<LlmRequestConfig | undefined>
): LlmRequestConfig | undefined {
  const common: CommonLlmRequestConfig = {};
  const keys = ["endpoint", "reasoningEffort", "temperature", "topP"] as const;

  for (const config of configs) {
    if (!config?.common) continue;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(config.common, key)) continue;
      const value = config.common[key];
      if (value === undefined) delete common[key];
      else Object.assign(common, { [key]: value });
    }
  }

  return compactLlmRequestConfig({ common });
}

export function compactLlmRequestConfig(
  config?: LlmRequestConfig,
): LlmRequestConfig | undefined {
  const common = compactCommon(config?.common);
  return common ? { common } : undefined;
}

export function compactModelSettings(settings: ModelSettings): ModelSettings {
  const llmRequestConfig = compactLlmRequestConfig(settings.llmRequestConfig);
  if (!llmRequestConfig) return {};

  return {
    llmRequestConfig: compactLlmRequestConfig({
      common: {
        ...llmRequestConfig.common,
        reasoningEffort: normalizeCanonicalReasoningLevel(
          llmRequestConfig.common?.reasoningEffort,
        ),
      },
    }),
  };
}
