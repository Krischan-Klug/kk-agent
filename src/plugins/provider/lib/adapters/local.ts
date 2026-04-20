import { basename } from "node:path";
import type { ProviderAdapter } from "../adapter.js";
import type {
  EndpointCapabilities,
  EndpointTransportProfile,
  ModelCapabilities,
  ModelInfo,
  ProviderConfig,
  ReasoningControl,
  ReasoningEffort,
  VisionSupport,
} from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";
import { DEFAULT_REASONING_LEVELS } from "../capabilities.js";

type DetectionResult = {
  models: ModelInfo[];
};

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function createEndpointCapabilities(
  maxTokensMax = 131072,
): Partial<Record<"chat-completions" | "responses", EndpointCapabilities>> {
  const sharedRange = { min: 1, max: maxTokensMax, step: 1 };
  const sharedEndpoint = {
    temperatureSupported: true,
    temperatureRange: { min: 0, max: 2, step: 0.1 },
    maxOutputTokensSupported: true,
    maxOutputTokensRange: sharedRange,
  } satisfies Pick<EndpointCapabilities, "temperatureSupported" | "temperatureRange" | "maxOutputTokensSupported" | "maxOutputTokensRange">;

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
      reasoningTransport: reasoningControl === "none" ? "none" : "responses-effort",
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
  maxTokensMax?: number,
  overrides: Partial<Pick<ModelCapabilities, "visionSupport" | "reasoningSource" | "reasoningControl" | "reasoningLevels">> = {},
): ModelCapabilities {
  const reasoningControl = overrides.reasoningControl ?? "effort";
  const allowedEfforts = overrides.reasoningLevels ?? [...DEFAULT_REASONING_LEVELS];
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
    endpointCapabilities: createEndpointCapabilities(maxTokensMax),
    transportProfiles: createTransportProfiles(reasoningControl),
  };
}

function buildLmStudioCapabilities(model: {
  max_context_length?: number;
  loaded_instances?: Array<{ config?: { context_length?: number } }>;
  capabilities?: { reasoning?: { allowed_options?: string[] }; vision?: unknown };
}): ModelCapabilities {
  const contextWindow = model.loaded_instances?.[0]?.config?.context_length ?? model.max_context_length;
  const visionSupport: VisionSupport = model.capabilities?.vision ? "supported" : "unknown";
  const allowedOptions = model.capabilities?.reasoning?.allowed_options ?? [];
  const usesOnOff = allowedOptions.length > 0 && allowedOptions.every((option) => option === "on" || option === "off");
  const allowedEfforts = allowedOptions
    .filter((option): option is ReasoningEffort => [...DEFAULT_REASONING_LEVELS].includes(option as ReasoningEffort));

  return createCapabilities(contextWindow, {
    visionSupport,
    reasoningSource: model.capabilities?.reasoning ? "declared" : "inferred",
    reasoningControl: usesOnOff ? "on-off" : "effort",
    reasoningLevels: usesOnOff ? [] : (allowedEfforts.length > 0 ? allowedEfforts : undefined),
  });
}

async function detectLmStudio(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<ModelInfo[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/models`, { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      models: Array<{
        key: string;
        max_context_length?: number;
        loaded_instances?: Array<{ config?: { context_length?: number } }>;
        capabilities?: { reasoning?: { allowed_options?: string[] }; vision?: unknown };
      }>;
    };

    return data.models.map((model) => ({
      id: model.key,
      object: "model",
      providerId,
      maxContextLength: model.max_context_length,
      contextLength: model.loaded_instances?.[0]?.config?.context_length,
      capabilities: buildLmStudioCapabilities(model),
    }));
  } catch {
    return null;
  }
}

async function detectOllama(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<ModelInfo[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((model) => ({
      id: model.name,
      object: "model",
      providerId,
      capabilities: createCapabilities(),
    }));
  } catch {
    return null;
  }
}

async function detectLlamaCpp(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<ModelInfo[] | null> {
  try {
    const res = await fetch(`${baseUrl}/props`, { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      model_path?: string;
      default_generation_settings?: { n_ctx?: number };
      n_ctx?: number;
    };
    const id = data.model_path ? basename(data.model_path) : "llama.cpp";
    const contextLength = data.default_generation_settings?.n_ctx ?? data.n_ctx;

    return [{
      id,
      object: "model",
      providerId,
      maxContextLength: contextLength,
      contextLength,
      capabilities: createCapabilities(contextLength),
    }];
  } catch {
    return null;
  }
}

async function detectGenericOpenAI(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<ModelInfo[]> {
  const res = await fetch(`${baseUrl}/v1/models`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch local models: ${res.status}`);

  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data.map((model) => ({
    id: model.id,
    object: "model",
    providerId,
    capabilities: createCapabilities(),
  }));
}

async function detectModels(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<DetectionResult> {
  const lmStudioModels = await detectLmStudio(baseUrl, headers, providerId);
  if (lmStudioModels) return { models: lmStudioModels };

  const ollamaModels = await detectOllama(baseUrl, headers, providerId);
  if (ollamaModels) return { models: ollamaModels };

  const llamaCppModels = await detectLlamaCpp(baseUrl, headers, providerId);
  if (llamaCppModels) return { models: llamaCppModels };

  return {
    models: await detectGenericOpenAI(baseUrl, headers, providerId),
  };
}

export function createLocalProviderAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers = buildHeaders(config);

  return {
    type: "local",

    chat(request) {
      const endpoint = request.endpoint === "responses" ? responses : chatCompletions;
      return endpoint.chat(request, baseUrl, headers);
    },

    chatStream(request, onChunk) {
      const endpoint = request.endpoint === "responses" ? responses : chatCompletions;
      return endpoint.chatStream(request, baseUrl, onChunk, headers);
    },

    async listModels(): Promise<ModelInfo[]> {
      const detected = await detectModels(baseUrl, headers, config.id);
      return detected.models;
    },

    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        await this.listModels();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
