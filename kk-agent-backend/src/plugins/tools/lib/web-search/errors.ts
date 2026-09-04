export type WebToolErrorKind =
  | "aborted"
  | "blocked_address"
  | "body_too_large"
  | "http_error"
  | "invalid_input"
  | "network_error"
  | "provider_blocked"
  | "provider_unavailable"
  | "redirect_error"
  | "timeout"
  | "unsupported_content";

export class WebToolError extends Error {
  constructor(
    message: string,
    readonly kind: WebToolErrorKind,
    readonly options: {
      status?: number;
      retryable?: boolean;
      url?: string;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "WebToolError";
  }
}

export function asWebToolError(error: unknown, url?: string): WebToolError {
  if (error instanceof WebToolError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new WebToolError("Web request was aborted.", "aborted", { url });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new WebToolError(message || "Web request failed.", "network_error", {
    retryable: true,
    url,
  });
}
