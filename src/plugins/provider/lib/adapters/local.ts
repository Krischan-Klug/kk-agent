import type { ProviderAdapter } from "../adapter.js";
import type { EndpointCapabilities, ModelCapabilities, ModelInfo, ProviderConfig } from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";
import { DEFAULT_REASONING_LEVELS } from "../../defaults.js";

type DetectionResult = {
  models: ModelInfo[];
};

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function createEndpointCapabilities(
  kind: "lmstudio" | "ollama" | "generic-openai",
  maxTokensMax = 131072,
): Partial<Record<"chat-completions" | "responses", EndpointCapabilities>> {
  const sharedRange = { min: 1, max: maxTokensMax, step: 1 };

  if (kind === "lmstudio") {
    return {
      "chat-completions": {
        temperatureSupported: true,
        temperatureRange: { min: 0, max: 2, step: 0.1 },
        maxOutputTokensSupported: true,
        maxOutputTokensRange: sharedRange,
      },
      responses: {
        temperatureSupported: true,
        temperatureRange: { min: 0, max: 2, step: 0.1 },
        maxOutputTokensSupported: true,
        maxOutputTokensRange: sharedRange,
      },
    };
  }

  return {
    "chat-completions": {
      temperatureSupported: true,
      temperatureRange: { min: 0, max: 2, step: 0.1 },
      maxOutputTokensSupported: true,
      maxOutputTokensRange: sharedRange,
    },
  };
}

function createCapabilities(
  kind: "lmstudio" | "ollama" | "generic-openai",
  maxTokensMax?: number,
): ModelCapabilities {
  if (kind === "lmstudio") {
    return {
      supportsTools: true,
      supportsReasoning: true,
      supportsVision: false,
      reasoningSource: "declared",
      supportsStreaming: true,
      supportedEndpoints: ["chat-completions", "responses"],
      reasoningControl: "effort",
      reasoningLevels: [...DEFAULT_REASONING_LEVELS],
      endpointCapabilities: createEndpointCapabilities(kind, maxTokensMax),
    };
  }

  if (kind === "ollama") {
    return {
      supportsTools: true,
      supportsReasoning: false,
      supportsVision: false,
      reasoningSource: "none",
      supportsStreaming: true,
      supportedEndpoints: ["chat-completions"],
      reasoningControl: "none",
      reasoningLevels: [],
      endpointCapabilities: createEndpointCapabilities(kind, maxTokensMax),
    };
  }

  return {
    supportsTools: true,
    supportsReasoning: false,
    supportsVision: false,
    reasoningSource: "none",
    supportsStreaming: true,
    supportedEndpoints: ["chat-completions"],
    reasoningControl: "none",
    reasoningLevels: [],
    endpointCapabilities: createEndpointCapabilities(kind, maxTokensMax),
  };
}

function buildLmStudioCapabilities(model: {
  max_context_length?: number;
  loaded_instances?: Array<{ config?: { context_length?: number } }>;
  capabilities?: { reasoning?: { allowed_options?: string[] }; vision?: unknown };
}): ModelCapabilities {
  const contextWindow = model.loaded_instances?.[0]?.config?.context_length ?? model.max_context_length;
  const supportsReasoning = !!model.capabilities?.reasoning;
  const supportsVision = !!model.capabilities?.vision;

  return {
    supportsTools: true,
    supportsReasoning,
    supportsVision,
    reasoningSource: supportsReasoning ? "declared" : "none",
    supportsStreaming: true,
    supportedEndpoints: ["chat-completions", "responses"],
    reasoningControl: supportsReasoning ? "effort" : "none",
    reasoningLevels: supportsReasoning ? [...DEFAULT_REASONING_LEVELS] : [],
    endpointCapabilities: createEndpointCapabilities("lmstudio", contextWindow),
  };
}

async function detectModels(baseUrl: string, headers: Record<string, string>, providerId: string): Promise<DetectionResult> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/models`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        models: Array<{
          key: string;
          max_context_length?: number;
          loaded_instances?: Array<{ config?: { context_length?: number } }>;
          capabilities?: { reasoning?: { allowed_options?: string[] }; vision?: unknown };
        }>;
      };
      return {
        models: data.models.map((model) => ({
          id: model.key,
          object: "model",
          providerId,
          maxContextLength: model.max_context_length,
          contextLength: model.loaded_instances?.[0]?.config?.context_length,
          capabilities: buildLmStudioCapabilities(model),
        })),
      };
    }
  } catch {
    // try next discovery endpoint
  }

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { headers });
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return {
        models: (data.models ?? []).map((model) => ({
          id: model.name,
          object: "model",
          providerId,
          capabilities: createCapabilities("ollama"),
        })),
      };
    }
  } catch {
    // try next discovery endpoint
  }

  const res = await fetch(`${baseUrl}/v1/models`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch local models: ${res.status}`);

  const data = (await res.json()) as { data: Array<{ id: string }> };
  return {
    models: data.data.map((model) => ({
      id: model.id,
      object: "model",
      providerId,
      capabilities: createCapabilities("generic-openai"),
    })),
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
