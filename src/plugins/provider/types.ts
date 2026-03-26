/* ── Provider Config ── */

export type ProviderType = "lmstudio" | "openai" | "anthropic";
export type EndpointType = "chat-completions" | "responses" | "completions" | "embeddings";
export type AuthMethod = "none" | "api-key" | "session-token";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  authMethod: AuthMethod;
  apiKey?: string;
  sessionToken?: string;
  endpoint: EndpointType;
  isDefault?: boolean;
}

export interface ProvidersState {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  modelSettings: Record<string, ModelSettings>;
}

/* ── Legacy (kept for migration) ── */

export interface ProviderSettings {
  baseUrl: string;
  activeModel: string;
}

/* ── Model ── */

export interface ModelInfo {
  id: string;
  object: string;
  maxContextLength?: number;
  contextLength?: number;
}

export interface ReasoningLevelConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelSettings {
  reasoningEffort?: string;
  reasoningOnOff?: boolean;
  levels?: Record<string, ReasoningLevelConfig>;
}
