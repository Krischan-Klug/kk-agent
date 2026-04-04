import { DEFAULT_REASONING_LEVELS } from "../defaults.js";
import type {
  EndpointCapabilities,
  EndpointTransportProfile,
  EndpointType,
  ModelCapabilities,
  ModelInfo,
  NumericRange,
} from "../types.js";

export function normalizeCanonicalReasoningLevel(effort?: string): string | undefined {
  if (!effort) return undefined;
  if (effort === "off") return "none";
  if (effort === "on") return "high";
  return effort;
}

export function getReasoningLevels(capabilities?: ModelCapabilities): string[] {
  if (!capabilities?.supportsReasoning) return [];
  return [...DEFAULT_REASONING_LEVELS];
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

export function getEndpointTransportProfile(
  capabilities: ModelCapabilities | undefined,
  endpoint: EndpointType,
): EndpointTransportProfile {
  return capabilities?.transportProfiles[endpoint] ?? {
    supported: endpoint === "chat-completions",
    reasoningTransport: endpoint === "responses" ? "responses-effort" : "chat-completions-effort",
    toolSchemaTransport: endpoint === "responses" ? "responses-tools" : "chat-completions-tools",
    streamGrammar: endpoint === "responses" ? "openai-responses" : "openai-chat-completions",
    toolCallAssemblyMode: endpoint === "responses" ? "responses-output-state" : "chat-completions-indexed",
    supportsParallelToolCalls: true,
    supportsConcatenatedJsonSplit: true,
    continuationMode: endpoint === "responses" ? "raw-output-replay" : "none",
    supportsPreviousResponseId: false,
    supportsConversations: false,
    supportsStrictTools: endpoint !== "responses",
  };
}

export function getPreferredEndpoint(
  capabilities: ModelCapabilities | undefined,
  preferred?: EndpointType,
): EndpointType {
  const supportedEndpoints = (capabilities?.supportedEndpoints ?? ["chat-completions"])
    .filter((endpoint) => getEndpointTransportProfile(capabilities, endpoint).supported);
  if (preferred && supportedEndpoints.includes(preferred)) return preferred;
  return supportedEndpoints[0] ?? "chat-completions";
}

export function coerceReasoningSelection(
  capabilities: ModelCapabilities | undefined,
  endpoint: EndpointType,
  effort?: string,
): string | undefined {
  const normalized = normalizeCanonicalReasoningLevel(effort);
  if (!normalized || !capabilities?.supportsReasoning || capabilities.reasoningControl === "none") return undefined;

  const allowed = getReasoningLevels(capabilities);
  if (allowed.length === 0) return undefined;

  const profile = getEndpointTransportProfile(capabilities, endpoint);
  if (profile.reasoningTransport === "responses-effort") {
    if (allowed.includes(normalized)) return normalized;
    if (normalized === "xhigh" && allowed.includes("high")) return "high";
    if (allowed.includes("medium")) return "medium";
    return allowed[0];
  }

  if (profile.reasoningTransport === "chat-completions-on-off") {
    return normalized === "none" ? "off" : "on";
  }

  if (profile.reasoningTransport === "none") return undefined;
  if (allowed.includes(normalized)) return normalized;
  if (normalized === "xhigh" && allowed.includes("high")) return "high";
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
