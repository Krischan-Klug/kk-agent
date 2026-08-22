type ProviderErrorKind =
  | "prompt_too_long"
  | "model_unloaded"
  | "rate_limit"
  | "transient"
  | "fatal";

interface ClassifiedProviderError {
  kind: ProviderErrorKind;
  status?: number;
  message: string;
  cause: unknown;
}

const STATUS_RE = /\b(\d{3})\b/;

function extractStatus(message: string): number | undefined {
  const match = STATUS_RE.exec(message);
  if (!match) return undefined;
  const status = Number(match[1]);
  if (status >= 100 && status <= 599) return status;
  return undefined;
}

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const status = extractStatus(message);

  if (
    lower.includes("model_unloaded")
    || lower.includes("model is not loaded")
    || lower.includes("model isn't loaded")
    || lower.includes("no model loaded")
    || lower.includes("no models loaded")
  ) {
    return { kind: "model_unloaded", status, message, cause: error };
  }

  if (
    status === 413 ||
    lower.includes("context_length_exceeded") ||
    lower.includes("prompt is too long") ||
    lower.includes("context length") ||
    lower.includes("maximum context") ||
    lower.includes("too many tokens")
  ) {
    return { kind: "prompt_too_long", status, message, cause: error };
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return { kind: "rate_limit", status, message, cause: error };
  }

  if (
    (status !== undefined && status >= 500 && status <= 599) ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("socket hang up") ||
    lower.includes("network") ||
    lower.includes("timeout")
  ) {
    return { kind: "transient", status, message, cause: error };
  }

  return { kind: "fatal", status, message, cause: error };
}

export function computeBackoffMs(attempt: number): number {
  // attempt: 1, 2, 3 → ~1s, ~3s, ~9s with jitter
  const base = 1000 * 3 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}
