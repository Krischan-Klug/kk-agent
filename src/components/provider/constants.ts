import type { EndpointType } from "@/types/api";

export const DEFAULT_PROVIDER_BASE_URL = "http://127.0.0.1:1234";

export const ENDPOINT_OPTIONS: { value: EndpointType; label: string }[] = [
  { value: "chat-completions", label: "/v1/chat/completions" },
  { value: "responses", label: "/v1/responses" },
];
