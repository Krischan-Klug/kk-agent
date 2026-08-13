import type { ContinuationMode, EndpointType, ModelInfo, ModelSettings } from "../types.js";
import type { UnifiedRequest } from "./types.js";
import {
  clampNumber,
  coerceReasoningSelection,
  getEndpointCapabilities,
  getEndpointTransportProfile,
  getPreferredEndpoint,
  mergeLlmRequestConfigs,
} from "kk-agent-contract";

export function normalizeRequestOptions(
  model: ModelInfo | undefined,
  settings: ModelSettings,
  request: UnifiedRequest,
  forcedEndpoint?: EndpointType,
): Pick<
  UnifiedRequest,
  "endpoint" | "transportProfile" | "resolvedLlmRequestConfig"
> & { explicitEndpointSelection: boolean } {
  const mergedConfig = mergeLlmRequestConfigs(settings.llmRequestConfig, request.llmRequestConfig);
  const explicitEndpointSelection = mergedConfig?.common?.endpoint !== undefined;
  const endpoint = forcedEndpoint ?? getPreferredEndpoint(model?.capabilities, mergedConfig?.common?.endpoint);
  const endpointCapabilities = getEndpointCapabilities(model?.capabilities, endpoint);
  const continuationMode: ContinuationMode = endpoint === "responses"
    ? getEndpointTransportProfile(model?.capabilities, endpoint).continuationMode
    : "none";
  const transportProfile = endpoint === "responses"
    ? {
        ...getEndpointTransportProfile(model?.capabilities, endpoint),
        continuationMode,
      }
    : getEndpointTransportProfile(model?.capabilities, endpoint);
  const rawReasoningSelection = mergedConfig?.common?.reasoningEffort;
  const reasoningEffort = coerceReasoningSelection(model?.capabilities, endpoint, rawReasoningSelection);
  const temperature = endpointCapabilities.temperatureSupported
    ? clampNumber(mergedConfig?.common?.temperature, endpointCapabilities.temperatureRange)
    : undefined;
  const topP = clampNumber(mergedConfig?.common?.topP, { min: 0, max: 1 });
  const resolvedLlmRequestConfig = {
    common: {
      endpoint,
      reasoningEffort,
      temperature,
      topP,
    },
  };

  return {
    endpoint,
    transportProfile,
    resolvedLlmRequestConfig,
    explicitEndpointSelection,
  };
}
