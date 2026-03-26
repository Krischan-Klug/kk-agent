/**
 * OpenAI Adapter
 *
 * Supports two auth methods:
 * - api-key:        Standard Bearer token auth
 * - session-token:  Unofficial — uses a ChatGPT browser session cookie
 *                   to exchange for a short-lived access token.
 *
 * Supports two endpoints: chat-completions and responses.
 */
import type { ProviderAdapter } from "../adapter.js";
import type { ProviderConfig, ModelInfo } from "../../types.js";
import * as chatCompletions from "../endpoints/chat-completions.js";
import * as responses from "../endpoints/responses.js";

const DEFAULT_BASE_URL = "https://api.openai.com";

/** Cache for session-token → access-token exchange */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Resolve the Authorization header for this config.
 * API key: direct. Session token: exchange for access token (cached).
 */
async function resolveAuthHeaders(config: ProviderConfig): Promise<Record<string, string>> {
  if (config.authMethod === "api-key" && config.apiKey) {
    return { Authorization: `Bearer ${config.apiKey}` };
  }

  if (config.authMethod === "session-token" && config.sessionToken) {
    // Check cache
    if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
      return { Authorization: `Bearer ${cachedAccessToken.token}` };
    }

    // Exchange session cookie for access token
    const res = await fetch("https://chat.openai.com/api/auth/session", {
      headers: { Cookie: `__Secure-next-auth.session-token=${config.sessionToken}` },
    });

    if (!res.ok) {
      throw new Error(`Session token exchange failed (${res.status}). Token may be expired.`);
    }

    const data = (await res.json()) as { accessToken?: string; expires?: string };
    if (!data.accessToken) {
      throw new Error("Session token exchange returned no access token. Token may be invalid.");
    }

    // Cache for ~55 minutes (tokens typically last 1h)
    cachedAccessToken = {
      token: data.accessToken,
      expiresAt: data.expires ? new Date(data.expires).getTime() - 5 * 60_000 : Date.now() + 55 * 60_000,
    };

    return { Authorization: `Bearer ${cachedAccessToken.token}` };
  }

  return {};
}

export function createOpenAiAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = config.endpoint || "chat-completions";

  // Select the right endpoint module
  const ep = endpoint === "responses" ? responses : chatCompletions;

  return {
    type: "openai",

    async chat(request) {
      const headers = await resolveAuthHeaders(config);
      return ep.chat(request, baseUrl, headers);
    },

    async chatStream(request, onChunk) {
      const headers = await resolveAuthHeaders(config);
      return ep.chatStream(request, baseUrl, onChunk, headers);
    },

    async listModels(): Promise<ModelInfo[]> {
      const headers = await resolveAuthHeaders(config);
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
