import type { ContinuationMode, EndpointType, ModelInfo, ModelSettings } from "../types.js";
import type { UnifiedRequest } from "./types.js";
import {
  clampNumber,
  coerceReasoningSelection,
  getEndpointCapabilities,
  getEndpointTransportProfile,
  getPreferredEndpoint,
  resolveMaxOutputRange,
} from "./capabilities.js";
import {
  buildResolvedLlmRequestConfig,
  mergeLlmRequestConfigs,
  sanitizeEndpointExtraBody,
} from "./request-config.js";

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
  const maxOutputRange = resolveMaxOutputRange(model, endpoint);
  const omittedUnsupportedKeys: string[] = [];
  const rawReasoningSelection = mergedConfig?.common?.reasoningEffort;
  const reasoningEffort = coerceReasoningSelection(model?.capabilities, endpoint, rawReasoningSelection);
  const temperature = endpointCapabilities.temperatureSupported
    ? clampNumber(mergedConfig?.common?.temperature, endpointCapabilities.temperatureRange)
    : undefined;
  const maxOutputTokens = endpointCapabilities.maxOutputTokensSupported
    ? clampNumber(mergedConfig?.common?.maxOutputTokens, maxOutputRange)
    : undefined;

  const sanitizedExtraBody = sanitizeEndpointExtraBody(endpoint, mergedConfig?.extraBody?.[endpoint]);
  omittedUnsupportedKeys.push(...sanitizedExtraBody.omittedKeys.map((key) => `extraBody.${endpoint}.${key}`));
  const resolvedLlmRequestConfig = buildResolvedLlmRequestConfig({
    endpoint,
    common: {
      endpoint,
      reasoningEffort,
      temperature,
      maxOutputTokens,
    },
    extraBody: sanitizedExtraBody.value,
    omittedUnsupportedKeys,
  });

  return {
    endpoint,
    transportProfile,
    resolvedLlmRequestConfig,
    explicitEndpointSelection,
  };
}
