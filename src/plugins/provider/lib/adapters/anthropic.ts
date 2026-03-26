/**
 * Anthropic Adapter
 *
 * Connects to the Anthropic Messages API with API key auth.
 * Uses the anthropic-messages endpoint for the native format.
 */
import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig, ModelInfo } from "../../types.js";
import * as anthropicMessages from "../endpoints/anthropic-messages.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

function buildHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }
  return headers;
}

export function createAnthropicAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");

  return {
    type: "anthropic",

    chat(request) {
      return anthropicMessages.chat(request, baseUrl, buildHeaders(config));
    },

    chatStream(request, onChunk) {
      return anthropicMessages.chatStream(request, baseUrl, onChunk, buildHeaders(config));
    },

    async listModels(): Promise<ModelInfo[]> {
      // Anthropic doesn't have a public models list endpoint.
      // Return a curated list of known models.
      return [
        { id: "claude-sonnet-4-20250514", object: "model" },
        { id: "claude-haiku-4-20250514", object: "model" },
        { id: "claude-3-5-sonnet-20241022", object: "model" },
        { id: "claude-3-5-haiku-20241022", object: "model" },
      ];
    },

    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        // Simple request to verify API key works
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildHeaders(config) },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        // Even a 400 means the key is valid (just bad request shape)
        if (res.ok || res.status === 400) return { ok: true };
        if (res.status === 401) return { ok: false, error: "Invalid API key" };
        return { ok: false, error: `Unexpected status: ${res.status}` };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
