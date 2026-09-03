import type { ProviderConfig } from "../../types.js";
import type { DiscoveredModel, ProviderAdapter } from "../adapter.js";
import { complete as completeChatCompletions } from "../endpoints/chat-completions.js";
import { complete as completeResponses } from "../endpoints/responses.js";
import { requestProviderJson } from "../http.js";
import { isPlainObject } from "../object-utils.js";
import { getErrorMessage } from "../../../../lib/error.js";

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function positiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return undefined;
}

function getVisualInputSupport(model: Record<string, unknown>): boolean | undefined {
  const capabilities = isPlainObject(model.capabilities) ? model.capabilities : undefined;
  if (typeof capabilities?.vision === "boolean") return capabilities.vision;
  if (Array.isArray(model.input_modalities)) {
    return model.input_modalities.includes("image") || model.input_modalities.includes("vision");
  }
  return undefined;
}

function getBooleanCapability(model: Record<string, unknown>, key: string): boolean | undefined {
  const capabilities = isPlainObject(model.capabilities) ? model.capabilities : undefined;
  return typeof capabilities?.[key] === "boolean" ? capabilities[key] : undefined;
}

function parseModel(value: unknown, providerId: string): DiscoveredModel | undefined {
  if (!isPlainObject(value) || typeof value.id !== "string" || value.id.trim().length === 0) return undefined;
  return {
    id: value.id,
    object: typeof value.object === "string" ? value.object : "model",
    providerId,
    ownedBy: typeof value.owned_by === "string" ? value.owned_by : undefined,
    loaded: typeof value.loaded === "boolean"
      ? value.loaded
      : typeof value.is_loaded === "boolean" ? value.is_loaded : undefined,
    maxContextLength: positiveInteger(
      value.max_context_length,
      value.max_model_len,
      value.context_window,
    ),
    contextLength: positiveInteger(
      value.context_length,
      value.loaded_context_length,
    ),
    runtimeCapabilities: {
      visualInputSupported: getVisualInputSupport(value),
      nativeToolsSupported: getBooleanCapability(value, "tools"),
      reasoningSupported: getBooleanCapability(value, "reasoning"),
    },
  };
}

async function detectModels(
  baseUrl: string,
  headers: Record<string, string>,
  providerId: string,
): Promise<DiscoveredModel[]> {
  const payload = await requestProviderJson(
    `${baseUrl}/models`,
    { headers },
    "Model discovery",
    { timeoutMs: 30_000 },
  );
  if (!Array.isArray(payload.data)) {
    throw new Error("Model discovery returned an invalid OpenAI-compatible response.");
  }
  return payload.data.flatMap((entry) => {
    const model = parseModel(entry, providerId);
    return model ? [model] : [];
  });
}

export function createOpenAiProviderAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const headers = buildHeaders(config);
  const listModels = () => detectModels(baseUrl, headers, config.id);
  return {
    complete(request, onChunk) {
      switch (request.endpoint) {
        case "chat-completions":
          return completeChatCompletions(request, baseUrl, onChunk, headers);
        case "responses":
          return completeResponses(request, baseUrl, onChunk, headers);
      }
    },
    listModels,
    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        await listModels();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: getErrorMessage(error) };
      }
    },
  };
}
