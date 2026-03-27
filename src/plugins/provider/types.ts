/* ── Provider Config ── */

export type ProviderType = "lmstudio" | "openai" | "anthropic";
export type EndpointType = "chat-completions" | "responses";
export type AuthMethod = "none" | "api-key";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  authMethod: AuthMethod;
  apiKey?: string;
  isDefault?: boolean;
}

export interface ProvidersState {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  modelSettings: Record<string, ModelSettings>;
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
  endpoint?: EndpointType;
  reasoningEffort?: string;
  reasoningOnOff?: boolean;
  levels?: Record<string, ReasoningLevelConfig>;
}
