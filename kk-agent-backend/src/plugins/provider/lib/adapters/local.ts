import type { ProviderAdapter } from "../adapter.js";
import type {
  EndpointCapabilities,
  EndpointTransportProfile,
  ModelCapabilities,
  ModelInfo,
  ProviderConfig,
  ReasoningControl,
} from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";
import { DEFAULT_REASONING_LEVELS } from "kk-agent-contract";
import { getErrorMessage } from "../../../../lib/error.js";

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function createEndpointCapabilities(): Partial<Record<"chat-completions" | "responses", EndpointCapabilities>> {
  const sharedEndpoint = {
    temperatureSupported: true,
    temperatureRange: { min: 0, max: 2, step: 0.1 },
  } satisfies EndpointCapabilities;

  return {
    "chat-completions": sharedEndpoint,
    responses: sharedEndpoint,
  };
}

function createTransportProfiles(
  reasoningControl: ReasoningControl,
): Partial<Record<"chat-completions" | "responses", EndpointTransportProfile>> {
  const chatReasoningTransport =
    reasoningControl === "on-off"
      ? "chat-completions-on-off"
      : reasoningControl === "effort"
        ? "chat-completions-effort"
        : "none";

  return {
    "chat-completions": {
      supported: true,
      reasoningTransport: chatReasoningTransport,
      toolSchemaTransport: "chat-completions-tools",
      streamGrammar: "openai-chat-completions",
      toolCallAssemblyMode: "chat-completions-indexed",
      supportsConcatenatedJsonSplit: true,
      continuationMode: "none",
      supportsStrictTools: true,
    },
    responses: {
      supported: true,
      reasoningTransport:
        reasoningControl === "none" ? "none" : "responses-effort",
      toolSchemaTransport: "responses-tools",
      streamGrammar: "openai-responses",
      toolCallAssemblyMode: "responses-output-state",
      supportsConcatenatedJsonSplit: true,
      continuationMode: "previous-response-id",
      supportsStrictTools: false,
    },
  };
}

function createCapabilities(
  overrides: Partial<
    Pick<
      ModelCapabilities,
      | "visionSupport"
      | "reasoningSource"
      | "reasoningControl"
      | "reasoningLevels"
    >
  > = {},
): ModelCapabilities {
  const reasoningControl = overrides.reasoningControl ?? "effort";
  const allowedEfforts = overrides.reasoningLevels ?? [
    ...DEFAULT_REASONING_LEVELS,
  ];
  return {
    supportsTools: true,
    supportsReasoning: allowedEfforts.length > 0,
    visionSupport: overrides.visionSupport ?? "unknown",
    reasoningSource: overrides.reasoningSource ?? "inferred",
    supportsStreaming: true,
    supportedEndpoints: ["responses", "chat-completions"],
    reasoningControl,
    reasoningLevels: [...allowedEfforts],
    reasoning: {
      allowedEfforts: [...allowedEfforts],
    },
    endpointCapabilities: createEndpointCapabilities(),
    transportProfiles: createTransportProfiles(reasoningControl),
  };
}

/**
 * Create a ModelInfo for a manually-specified model id.
 */
export function createManualModel(
  providerId: string,
  modelId: string,
): ModelInfo {
  return {
    id: modelId,
    object: "model",
    providerId,
    capabilities: createCapabilities(),
  };
}

async function detectModels(
  baseUrl: string,
  headers: Record<string, string>,
  providerId: string,
): Promise<ModelInfo[]> {
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);

  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data.map((model) => ({
    id: model.id,
    object: "model",
    providerId,
    capabilities: createCapabilities(),
  }));
}

export function createLocalProviderAdapter(
  config: ProviderConfig,
): ProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers = buildHeaders(config);

  return {
    type: "local",

    chatStream(request, onChunk) {
      const endpoint =
        request.endpoint === "responses" ? responses : chatCompletions;
      return endpoint.chatStream(request, baseUrl, onChunk, headers);
    },

    async listModels(): Promise<ModelInfo[]> {
      return detectModels(baseUrl, headers, config.id);
    },

    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        await this.listModels();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err) };
      }
    },
  };
}
