import type {
  EndpointCapabilities,
  EndpointTransportProfile,
  EndpointType,
  ModelCapabilities,
  ModelInfo,
  NumericRange,
  VisionSupport,
} from "./provider.js";
import type { ReasoningEffort } from "./agent.js";

export const DEFAULT_REASONING_LEVELS = ["minimal", "low", "medium", "high"] as const;

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (DEFAULT_REASONING_LEVELS as readonly string[]).includes(value);
}

export function normalizeCanonicalReasoningLevel(effort?: string): ReasoningEffort | undefined {
  if (!effort) return undefined;
  return isReasoningEffort(effort) ? effort : undefined;
}

export function getReasoningLevels(capabilities?: ModelCapabilities): ReasoningEffort[] {
  if (!capabilities?.supportsReasoning) return [];

  const declared = capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels ?? [];
  const normalized = declared
    .map((effort) => normalizeCanonicalReasoningLevel(effort))
    .filter((effort): effort is ReasoningEffort => Boolean(effort));

  return [...new Set(normalized)];
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
    supportsConcatenatedJsonSplit: true,
    continuationMode: endpoint === "responses" ? "previous-response-id" : "none",
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
  if (supportedEndpoints.includes("responses")) return "responses";
  return supportedEndpoints[0] ?? "chat-completions";
}

export function coerceReasoningSelection(
  capabilities: ModelCapabilities | undefined,
  endpoint: EndpointType,
  effort?: string,
): ReasoningEffort | undefined {
  const trimmed = effort?.trim();
  const normalized = normalizeCanonicalReasoningLevel(trimmed);
  if (!capabilities?.supportsReasoning || capabilities.reasoningControl === "none") return undefined;

  const allowed = getReasoningLevels(capabilities);
  if (allowed.length === 0) return undefined;

  const profile = getEndpointTransportProfile(capabilities, endpoint);
  if (profile.reasoningTransport === "responses-effort") {
    if (!normalized) return undefined;
    if (allowed.includes(normalized)) return normalized;
    if (allowed.includes("medium")) return "medium";
    return allowed[0];
  }

  if (profile.reasoningTransport === "chat-completions-on-off") {
    if (!normalized) return undefined;
    if (allowed.includes(normalized)) return normalized;
    return allowed.includes("high") ? "high" : allowed[allowed.length - 1];
  }

  if (profile.reasoningTransport === "none") return undefined;
  if (!normalized) return undefined;
  if (allowed.includes(normalized)) return normalized;
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

export function allowsVisionInputs(visionSupport: VisionSupport | undefined): boolean {
  return visionSupport !== "unsupported";
}
