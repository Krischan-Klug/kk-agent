import type { AuthMethod, EndpointType, ProviderType } from "@/types/api";

export const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: "lmstudio", label: "LM Studio" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

export const ENDPOINT_OPTIONS: { value: EndpointType; label: string }[] = [
  { value: "chat-completions", label: "/v1/chat/completions" },
  { value: "responses", label: "/v1/responses" },
];

export const AUTH_OPTIONS: Record<ProviderType, { value: AuthMethod; label: string }[]> = {
  lmstudio: [{ value: "none", label: "Keine" }],
  openai: [{ value: "api-key", label: "API Key" }],
  anthropic: [{ value: "api-key", label: "API Key" }],
};

export const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  lmstudio: "http://localhost:1234",
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
};
