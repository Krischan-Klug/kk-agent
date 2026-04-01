import { DEFAULT_REASONING_LEVELS } from "../defaults.js";
import type {
  EndpointCapabilities,
  EndpointType,
  ModelCapabilities,
  ModelInfo,
  NumericRange,
} from "../types.js";

export function getReasoningLevels(capabilities?: ModelCapabilities): string[] {
  if (!capabilities?.supportsReasoning) return [];
  return capabilities.reasoningLevels.length > 0 ? capabilities.reasoningLevels : [...DEFAULT_REASONING_LEVELS];
}

export function getEndpointCapabilities(
  capabilities: ModelCapabilities | undefined,
  endpoint: EndpointType,
): EndpointCapabilities {
  return capabilities?.endpointCapabilities[endpoint] ?? {
    temperatureSupported: false,
    maxOutputTokensSupported: false,
  };
}

export function getPreferredEndpoint(
  capabilities: ModelCapabilities | undefined,
  preferred?: EndpointType,
): EndpointType {
  const supportedEndpoints = capabilities?.supportedEndpoints ?? ["chat-completions"];
  if (preferred && supportedEndpoints.includes(preferred)) return preferred;
  return supportedEndpoints[0] ?? "chat-completions";
}

export function coerceReasoningSelection(capabilities: ModelCapabilities | undefined, effort?: string): string | undefined {
  if (!effort || !capabilities?.supportsReasoning || capabilities.reasoningControl === "none") return undefined;

  if (capabilities.reasoningControl === "on-off") {
    return effort === "none" ? "off" : "on";
  }

  const allowed = getReasoningLevels(capabilities);
  if (allowed.length === 0) return undefined;
  if (allowed.includes(effort)) return effort;
  if (effort === "xhigh" && allowed.includes("high")) return "high";
  return allowed[allowed.length - 1];
}

export function clampNumber(value: number | undefined, range?: NumericRange): number | undefined {
  if (value === undefined) return undefined;
  if (!range) return value;

  const bounded = Math.min(range.max, Math.max(range.min, value));
  if (!range.step || range.step <= 0) return bounded;

  const steps = Math.round((bounded - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(6));
}

export function resolveMaxOutputRange(model: ModelInfo | undefined, endpoint: EndpointType): NumericRange | undefined {
  const endpointRange = getEndpointCapabilities(model?.capabilities, endpoint).maxOutputTokensRange;
  if (!endpointRange) return undefined;

  const contextMax = model?.contextLength ?? model?.maxContextLength;
  if (!contextMax) return endpointRange;

  return {
    ...endpointRange,
    max: Math.min(endpointRange.max, contextMax),
  };
}
