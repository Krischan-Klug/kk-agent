/**
 * LM Studio Adapter
 *
 * Connects to a local LM Studio instance. No auth required.
 * Supports the native LM Studio API for richer model info, with
 * fallback to the OpenAI-compatible /v1/models endpoint.
 */
import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig, ModelInfo } from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";

export function createLmStudioAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const endpoint = config.endpoint === "responses" ? responses : chatCompletions;

  return {
    type: "lmstudio",

    chat: (request) => endpoint.chat(request, baseUrl),

    chatStream: (request, onChunk) => endpoint.chatStream(request, baseUrl, onChunk),

    async listModels(): Promise<ModelInfo[]> {
      // Try native LM Studio API first (richer info: context length)
      try {
        const res = await fetch(`${baseUrl}/api/v1/models`);
        if (res.ok) {
          const data = (await res.json()) as {
            models: Array<{
              key: string;
              max_context_length?: number;
              loaded_instances?: Array<{ id: string; config?: { context_length?: number } }>;
            }>;
          };
          return data.models.map((m) => ({
            id: m.key,
            object: "model",
            maxContextLength: m.max_context_length,
            contextLength: m.loaded_instances?.[0]?.config?.context_length,
          }));
        }
      } catch {
        // fall through to OpenAI-compat endpoint
      }

      // Fallback: OpenAI-compatible /v1/models
      const res = await fetch(`${baseUrl}/v1/models`);
      if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
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
