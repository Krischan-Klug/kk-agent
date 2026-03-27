/**
 * OpenAI Adapter
 *
 * Auth: API key only (Bearer token).
 * Endpoint resolved per-request from model settings.
 */
import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig, ModelInfo } from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";

const DEFAULT_BASE_URL = "https://api.openai.com";

function resolveAuthHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

export function createOpenAiAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");

  return {
    type: "openai",

    chat(request) {
      const headers = resolveAuthHeaders(config);
      const ep = request.endpoint === "responses" ? responses : chatCompletions;
      return ep.chat(request, baseUrl, headers);
    },

    chatStream(request, onChunk) {
      const headers = resolveAuthHeaders(config);
      const ep = request.endpoint === "responses" ? responses : chatCompletions;
      return ep.chatStream(request, baseUrl, onChunk, headers);
    },

    async listModels(): Promise<ModelInfo[]> {
      const headers = resolveAuthHeaders(config);
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { ...headers },
      });
      if (!res.ok) throw new Error(`Failed to fetch OpenAI models: ${res.status}`);
      const data = (await res.json()) as { data: Array<{ id: string }> };
      return data.data.map((m) => ({ id: m.id, object: "model" }));
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
