import { ProviderError } from "./errors.js";
import { isPlainObject } from "./object-utils.js";

const DEFAULT_INFERENCE_TIMEOUT_MS = 300_000;
const MAX_ERROR_BODY_CHARS = 8_000;

type ProviderRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type ProviderStreamHandle = {
  response: Response;
  signal: AbortSignal;
  close: () => void;
};

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function extractErrorDetails(body: string): {
  message: string;
  code?: string;
  providerType?: string;
  param?: string;
} {
  const fallback = body.trim().slice(0, MAX_ERROR_BODY_CHARS) || "Provider returned an empty error response.";
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isPlainObject(parsed)) return { message: fallback };
    const error = isPlainObject(parsed.error) ? parsed.error : parsed;
    return {
      message: typeof error.message === "string" ? error.message : fallback,
      code: typeof error.code === "string" ? error.code : undefined,
      providerType: typeof error.type === "string" ? error.type : undefined,
      param: typeof error.param === "string" ? error.param : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

function responseError(response: Response, operation: string, body: string): ProviderError {
  const details = extractErrorDetails(body);
  return new ProviderError(`${operation} failed (${response.status}): ${details.message}`, {
    status: response.status,
    code: details.code,
    providerType: details.providerType,
    param: details.param,
    requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
  });
}

function readResponseText(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      void response.body?.cancel().catch(() => undefined);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    response.text().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function createRequestScope(operation: string, options: ProviderRequestOptions) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeoutMs = options.timeoutMs ?? DEFAULT_INFERENCE_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    controller.abort(new ProviderError(`${operation} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);
  return {
    controller,
    clearTimeout: () => clearTimeout(timeout),
    close: () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    },
  };
}

function normalizeRequestError(
  error: unknown,
  operation: string,
  controller: AbortController,
  externalSignal?: AbortSignal,
): never {
  if (error instanceof ProviderError) throw error;
  if (externalSignal?.aborted) throw externalSignal.reason ?? error;
  if (controller.signal.aborted) throw controller.signal.reason ?? error;
  throw new ProviderError(`${operation} network error: ${error instanceof Error ? error.message : String(error)}`, {
    cause: error,
  });
}

export async function requestProviderJson(
  url: string,
  init: RequestInit,
  operation: string,
  options: ProviderRequestOptions = {},
): Promise<Record<string, unknown>> {
  const scope = createRequestScope(operation, options);
  try {
    scope.controller.signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal: scope.controller.signal });
    const body = await readResponseText(response, scope.controller.signal);
    if (!response.ok) throw responseError(response, operation, body);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new ProviderError(`${operation} returned malformed JSON.`, { cause: error });
    }
    if (!isPlainObject(parsed)) {
      throw new ProviderError(`${operation} returned a non-object JSON response.`);
    }
    return parsed;
  } catch (error) {
    normalizeRequestError(error, operation, scope.controller, options.signal);
  } finally {
    scope.close();
  }
}

export async function openProviderStream(
  url: string,
  init: RequestInit,
  operation: string,
  options: ProviderRequestOptions = {},
): Promise<ProviderStreamHandle> {
  const scope = createRequestScope(operation, options);
  try {
    scope.controller.signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal: scope.controller.signal });
    if (!response.ok) {
      throw responseError(
        response,
        operation,
        await readResponseText(response, scope.controller.signal),
      );
    }
    scope.clearTimeout();
    return {
      response,
      signal: scope.controller.signal,
      close: scope.close,
    };
  } catch (error) {
    scope.close();
    normalizeRequestError(error, operation, scope.controller, options.signal);
  }
}
