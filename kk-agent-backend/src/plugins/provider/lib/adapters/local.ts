import type { ProviderAdapter, DiscoveredModel } from "../adapter.js";
import type { ProviderConfig } from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";
import { getErrorMessage } from "../../../../lib/error.js";

interface NativeLmStudioModel {
  type: "llm" | "embedding";
  publisher?: string;
  key: string;
  architecture?: string | null;
  max_context_length?: number;
  loaded_instances?: Array<{ config?: { context_length?: number } }>;
  capabilities?: {
    vision?: boolean;
  };
}

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

export function createManualModel(providerId: string, modelId: string): DiscoveredModel {
  return {
    id: modelId,
    object: "model",
    providerId,
    runtimeCapabilities: {},
  };
}

function nativeApiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

async function detectNativeModels(
  baseUrl: string,
  headers: Record<string, string>,
  providerId: string,
): Promise<DiscoveredModel[]> {
  const res = await fetch(`${nativeApiRoot(baseUrl)}/api/v1/models`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch native models: ${res.status}`);
  const data = await res.json() as { models?: NativeLmStudioModel[] };
  return (data.models ?? [])
    .filter((model) => model.type === "llm")
    .map((model) => ({
      id: model.key,
      object: "model",
      providerId,
      publisher: model.publisher,
      architecture: model.architecture ?? undefined,
      maxContextLength: model.max_context_length,
      contextLength: model.loaded_instances?.[0]?.config?.context_length,
      runtimeCapabilities: {
        visualInputSupported: model.capabilities?.vision,
      },
    }));
}

async function detectOpenAiModels(
  baseUrl: string,
  headers: Record<string, string>,
  providerId: string,
): Promise<DiscoveredModel[]> {
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((model) => createManualModel(providerId, model.id));
}

async function detectModels(
  baseUrl: string,
  headers: Record<string, string>,
  providerId: string,
): Promise<DiscoveredModel[]> {
  try {
    const nativeModels = await detectNativeModels(baseUrl, headers, providerId);
    if (nativeModels.length > 0) return nativeModels;
  } catch {
    // A non-LM-Studio provider only exposes the OpenAI-compatible model list.
  }
  return detectOpenAiModels(baseUrl, headers, providerId);
}

export function createLocalProviderAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers = buildHeaders(config);
  return {
    type: "local",
    chatStream(request, onChunk) {
      const endpoint = request.endpoint === "responses" ? responses : chatCompletions;
      return endpoint.chatStream(request, baseUrl, onChunk, headers);
    },
    listModels() {
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
