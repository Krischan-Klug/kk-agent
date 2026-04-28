import type {
  EndpointType,
  ModelCapabilities,
  ModelObservation,
  ObservationSupportState,
} from "../types.js";
import {
  DEFAULT_REASONING_LEVELS,
  getEndpointCapabilities,
  getEndpointTransportProfile,
} from "./capabilities.js";

export type ObservationUpdate = {
  endpointSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  reasoningSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  responsesStatefulness?: ObservationSupportState;
  visionSupport?: ObservationSupportState;
};

function normalizeObservationSupportRecord(
  value?: Partial<Record<EndpointType, ObservationSupportState>>,
): Partial<Record<EndpointType, ObservationSupportState>> | undefined {
  if (!value) return undefined;
  const next = Object.fromEntries(
    Object.entries(value).filter(([, support]) => support === "supported" || support === "unsupported"),
  ) as Partial<Record<EndpointType, ObservationSupportState>>;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeObservation(record: ModelObservation): ModelObservation {
  return {
    endpointSupport: normalizeObservationSupportRecord(record.endpointSupport),
    reasoningSupport: normalizeObservationSupportRecord(record.reasoningSupport),
    responsesStatefulness: record.responsesStatefulness === "supported" || record.responsesStatefulness === "unsupported"
      ? record.responsesStatefulness
      : undefined,
    visionSupport: record.visionSupport === "supported" || record.visionSupport === "unsupported"
      ? record.visionSupport
      : undefined,
    lastObservedAt: record.lastObservedAt,
  };
}

export function setObservedEndpointSupport(
  update: ObservationUpdate,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    endpointSupport: {
      ...(update.endpointSupport ?? {}),
      [endpoint]: support,
    },
  };
}

export function setObservedReasoningSupport(
  update: ObservationUpdate,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    reasoningSupport: {
      ...(update.reasoningSupport ?? {}),
      [endpoint]: support,
    },
  };
}

export function setObservedResponsesStatefulness(
  update: ObservationUpdate,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    responsesStatefulness: support,
  };
}

export function setObservedVisionSupport(
  update: ObservationUpdate,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    visionSupport: support,
  };
}

export function mergeObservation(existing: ModelObservation | undefined, update: ObservationUpdate): ModelObservation {
  return normalizeObservation({
    endpointSupport: {
      ...(existing?.endpointSupport ?? {}),
      ...(update.endpointSupport ?? {}),
    },
    reasoningSupport: {
      ...(existing?.reasoningSupport ?? {}),
      ...(update.reasoningSupport ?? {}),
    },
    responsesStatefulness: update.responsesStatefulness ?? existing?.responsesStatefulness,
    visionSupport: update.visionSupport ?? existing?.visionSupport,
    lastObservedAt: new Date().toISOString(),
  });
}

export function hasObservationUpdate(update: ObservationUpdate): boolean {
  return Object.keys(update.endpointSupport ?? {}).length > 0
    || Object.keys(update.reasoningSupport ?? {}).length > 0
    || update.responsesStatefulness !== undefined
    || update.visionSupport !== undefined;
}

export function applyEndpointSupport(
  capabilities: ModelCapabilities,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    supportedEndpoints: capabilities.supportedEndpoints.includes(endpoint)
      ? capabilities.supportedEndpoints
      : [...capabilities.supportedEndpoints, endpoint],
    endpointCapabilities: {
      ...capabilities.endpointCapabilities,
      [endpoint]: capabilities.endpointCapabilities[endpoint] ?? getEndpointCapabilities(capabilities, endpoint),
    },
    transportProfiles: {
      ...capabilities.transportProfiles,
      [endpoint]: {
        ...getEndpointTransportProfile(capabilities, endpoint),
        supported: support !== "unsupported",
      },
    },
  };
}

export function applyReasoningSupport(
  capabilities: ModelCapabilities,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ModelCapabilities {
  if (support !== "supported") return capabilities;

  const allowedEfforts = (capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels).length > 0
    ? (capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels)
    : [...DEFAULT_REASONING_LEVELS];

  const nextCapabilities: ModelCapabilities = {
    ...capabilities,
    supportsReasoning: true,
    reasoningSource: "observed",
    reasoningControl: capabilities.reasoningControl === "none" ? "effort" : capabilities.reasoningControl,
    reasoningLevels: allowedEfforts,
    reasoning: {
      ...capabilities.reasoning,
      allowedEfforts,
    },
  };

  return {
    ...nextCapabilities,
    transportProfiles: {
      ...nextCapabilities.transportProfiles,
      "chat-completions": {
        ...getEndpointTransportProfile(nextCapabilities, "chat-completions"),
        reasoningTransport: nextCapabilities.reasoningControl === "on-off"
          ? "chat-completions-on-off"
          : "chat-completions-effort",
      },
      responses: {
        ...getEndpointTransportProfile(nextCapabilities, "responses"),
        reasoningTransport: "responses-effort",
      },
      [endpoint]: {
        ...getEndpointTransportProfile(nextCapabilities, endpoint),
        reasoningTransport: endpoint === "responses"
          ? "responses-effort"
          : nextCapabilities.reasoningControl === "on-off"
            ? "chat-completions-on-off"
            : "chat-completions-effort",
      },
    },
  };
}

export function applyResponsesStatefulness(
  capabilities: ModelCapabilities,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    transportProfiles: {
      ...capabilities.transportProfiles,
      responses: {
        ...getEndpointTransportProfile(capabilities, "responses"),
        continuationMode: support === "supported" ? "previous-response-id" : "raw-output-replay",
      },
    },
  };
}

export function applyVisionSupport(
  capabilities: ModelCapabilities,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    visionSupport: support === "supported" ? "supported" : "unsupported",
  };
}
