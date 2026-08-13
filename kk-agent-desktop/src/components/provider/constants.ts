import type { EndpointType } from "@/types/api";

export const DEFAULT_PROVIDER_BASE_URL = "http://127.0.0.1:1234/v1";

export const ENDPOINT_OPTIONS: { value: EndpointType; label: string }[] = [
  { value: "chat-completions", label: "/chat/completions" },
  { value: "responses", label: "/responses" },
];
