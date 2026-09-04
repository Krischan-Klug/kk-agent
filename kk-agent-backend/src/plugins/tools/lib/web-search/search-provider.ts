import { WebToolError, asWebToolError } from "./errors.js";
import { BingSearchProvider } from "./providers/bing.js";
import { assessSearchQuality, refinedSearchQuery } from "./relevance.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchProviderTrace, WebSearchResponse } from "./types.js";

const bingProvider = new BingSearchProvider();
const PROVIDER_MIN_INTERVAL_MS = 1_000;
const PROVIDER_JITTER_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

interface ProviderRuntimeState {
  tail: Promise<void>;
  lastStartedAt: number;
}

const providerStates = new Map<string, ProviderRuntimeState>();

function stateFor(providerId: string): ProviderRuntimeState {
  let state = providerStates.get(providerId);
  if (!state) {
    state = { tail: Promise.resolve(), lastStartedAt: 0 };
    providerStates.set(providerId, state);
  }
  return state;
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new WebToolError("Search was aborted.", "aborted"));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function scheduleProviderSearch(
  provider: WebSearchProvider,
  query: string,
  options: WebSearchOptions,
): Promise<WebSearchResponse> {
  if (provider.id !== "bing-html") return provider.search(query, options);

  const state = stateFor(provider.id);
  const previous = state.tail;
  let release = () => {};
  state.tail = new Promise<void>((resolve) => { release = resolve; });
  await previous;

  try {
    const earliestStart = state.lastStartedAt + PROVIDER_MIN_INTERVAL_MS
      + Math.floor(Math.random() * (PROVIDER_JITTER_MS + 1));
    await wait(Math.max(0, earliestStart - Date.now()), options.abortSignal);
    state.lastStartedAt = Date.now();
    return await provider.search(query, options);
  } finally {
    release();
  }
}

function retryDelay(error: WebToolError): number | undefined {
  if (!error.options.retryable || error.kind === "provider_blocked" || error.kind === "provider_unavailable") {
    return undefined;
  }
  const retryAfterMs = error.options.details?.retryAfterMs;
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAfterMs));
  }
  if (error.kind === "timeout" || error.kind === "network_error" || error.options.status === 408
    || error.options.status === 429 || (error.options.status !== undefined && error.options.status >= 500)) {
    return 500 + Math.floor(Math.random() * 501);
  }
  return undefined;
}

function withAttemptCount(error: WebToolError, attempts: number): WebToolError {
  return new WebToolError(error.message, error.kind, {
    ...error.options,
    details: { ...error.options.details, attempts },
  });
}

async function searchWithRetry(
  provider: WebSearchProvider,
  query: string,
  options: WebSearchOptions,
  maxAttempts: 1 | 2,
): Promise<{ response: WebSearchResponse; attempts: number }> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      return { response: await scheduleProviderSearch(provider, query, options), attempts };
    } catch (error) {
      const failure = asWebToolError(error);
      if (failure.kind === "aborted") throw failure;
      const delayMs = retryDelay(failure);
      if (delayMs === undefined || attempts >= maxAttempts) throw withAttemptCount(failure, attempts);
      await wait(delayMs, options.abortSignal);
    }
  }
  throw new WebToolError(`Search provider ${provider.id} failed.`, "provider_unavailable");
}

function failedSearch(provider: WebSearchProvider, failure: WebToolError, started: number): never {
  const attempts = Number(failure.options.details?.attempts ?? 1);
  const providerTrace: WebSearchProviderTrace[] = [{
    provider: provider.id,
    status: "failed",
    attempts,
    durationMs: Date.now() - started,
    reason: failure.message,
  }];
  throw new WebToolError(`Web search failed (${provider.id}: ${failure.message}).`, failure.kind, {
    ...failure.options,
    details: { ...failure.options.details, providerTrace },
  });
}

export async function searchWeb(
  query: string,
  options: WebSearchOptions,
  provider: WebSearchProvider = bingProvider,
): Promise<WebSearchResponse> {
  const started = Date.now();
  try {
    const initial = await searchWithRetry(provider, query, options, 2);
    const initialQuality = assessSearchQuality(query, initial.response.results);
    if (!initialQuality.suspicious) {
      const providerTrace: WebSearchProviderTrace[] = [{
        provider: provider.id,
        status: "succeeded",
        attempts: initial.attempts,
        durationMs: Date.now() - started,
        executedQuery: query,
      }];
      return { ...initial.response, query, executedQuery: query, results: initialQuality.results, providerTrace };
    }

    const refinedQuery = refinedSearchQuery(query);
    const refined = await searchWithRetry(provider, refinedQuery, options, 1);
    const refinedQuality = assessSearchQuality(query, refined.response.results);
    const providerTrace: WebSearchProviderTrace[] = [{
      provider: provider.id,
      status: "succeeded",
      attempts: initial.attempts + refined.attempts,
      durationMs: Date.now() - started,
      executedQuery: refinedQuery,
      refined: true,
      reason: "initial result set had no lexical query overlap",
    }];
    if (refinedQuality.suspicious) {
      return {
        ...refined.response,
        query,
        executedQuery: refinedQuery,
        results: [],
        qualityWarning: "Bing returned a result batch with no lexical connection to the query after refinement; the likely poisoned batch was discarded.",
        providerTrace,
      };
    }
    return { ...refined.response, query, executedQuery: refinedQuery, results: refinedQuality.results, providerTrace };
  } catch (error) {
    const failure = asWebToolError(error);
    if (failure.kind === "aborted") throw failure;
    return failedSearch(provider, failure, started);
  }
}

export function clearSearchProviderStateForTests(): void {
  providerStates.clear();
}
