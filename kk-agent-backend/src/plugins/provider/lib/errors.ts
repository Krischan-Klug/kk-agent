type ProviderErrorKind =
  | "prompt_too_long"
  | "model_unloaded"
  | "rate_limit"
  | "transient"
  | "fatal";

export interface ClassifiedProviderError {
  kind: ProviderErrorKind;
  status?: number;
  message: string;
  retryAfterMs?: number;
  cause: unknown;
}

export class ProviderError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly providerType?: string;
  readonly param?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, details: {
    status?: number;
    code?: string;
    providerType?: string;
    param?: string;
    requestId?: string;
    retryAfterMs?: number;
    cause?: unknown;
  } = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "ProviderError";
    this.status = details.status;
    this.code = details.code;
    this.providerType = details.providerType;
    this.param = details.param;
    this.requestId = details.requestId;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const status = error instanceof ProviderError ? error.status : undefined;
  const code = error instanceof ProviderError ? error.code?.toLowerCase() : undefined;
  const retryAfterMs = error instanceof ProviderError ? error.retryAfterMs : undefined;

  if (
    code === "model_unloaded"
    || lower.includes("model_unloaded")
    || lower.includes("model is not loaded")
    || lower.includes("model isn't loaded")
    || lower.includes("no model loaded")
    || lower.includes("no models loaded")
  ) {
    return { kind: "model_unloaded", status, message, retryAfterMs, cause: error };
  }

  if (
    status === 413
    || code === "context_length_exceeded"
    || lower.includes("context_length_exceeded")
    || lower.includes("prompt is too long")
    || lower.includes("context length")
    || lower.includes("maximum context")
    || lower.includes("too many tokens")
  ) {
    return { kind: "prompt_too_long", status, message, retryAfterMs, cause: error };
  }

  if (status === 429 || code === "rate_limit_exceeded" || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return { kind: "rate_limit", status, message, retryAfterMs, cause: error };
  }

  if (
    status === 408
    || status === 409
    || (status !== undefined && status >= 500 && status <= 599)
    || lower.includes("econnreset")
    || lower.includes("etimedout")
    || lower.includes("fetch failed")
    || lower.includes("socket hang up")
    || lower.includes("network")
    || lower.includes("timeout")
    || lower.includes("stream ended before")
  ) {
    return { kind: "transient", status, message, retryAfterMs, cause: error };
  }

  return { kind: "fatal", status, message, retryAfterMs, cause: error };
}

export function computeBackoffMs(attempt: number, retryAfterMs?: number): number {
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, 60_000);
  }
  const base = Math.min(1000 * 3 ** Math.max(0, attempt - 1), 30_000);
  return base + Math.floor(Math.random() * 400);
}
