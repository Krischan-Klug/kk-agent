import { WebToolError, asWebToolError } from "./errors.js";
import { DuckDuckGoSearchProvider } from "./providers/duckduckgo.js";
import { BingSearchProvider } from "./providers/bing.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchProviderTrace, WebSearchResponse } from "./types.js";

const providers: WebSearchProvider[] = [
  new DuckDuckGoSearchProvider(),
  new BingSearchProvider(),
];

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
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

async function searchWithRetry(provider: WebSearchProvider, query: string, options: WebSearchOptions): Promise<{
  response: WebSearchResponse;
  attempts: number;
}> {
  let lastError: WebToolError | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { response: await provider.search(query, options), attempts: attempt + 1 };
    } catch (error) {
      lastError = asWebToolError(error);
      if (lastError.kind === "aborted" || !lastError.options.retryable || attempt === 1) throw lastError;
      await wait(250 * (attempt + 1), options.abortSignal);
    }
  }
  throw lastError ?? new WebToolError(`Search provider ${provider.id} failed.`, "provider_unavailable");
}

export async function searchWeb(
  query: string,
  options: WebSearchOptions,
  candidates: WebSearchProvider[] = providers,
): Promise<WebSearchResponse> {
  const failures: string[] = [];
  const providerTrace: WebSearchProviderTrace[] = [];
  for (const provider of candidates) {
    if (!provider.isAvailable()) {
      providerTrace.push({
        provider: provider.id,
        status: "skipped",
        attempts: 0,
        durationMs: 0,
        reason: "not configured or unavailable",
      });
      continue;
    }
    const started = Date.now();
    try {
      const { response, attempts } = await searchWithRetry(provider, query, options);
      providerTrace.push({
        provider: provider.id,
        status: "succeeded",
        attempts,
        durationMs: Date.now() - started,
        selectedProvider: response.provider,
      });
      return { ...response, providerTrace };
    } catch (error) {
      const failure = asWebToolError(error);
      if (failure.kind === "aborted") throw failure;
      failures.push(`${provider.id}: ${failure.message}`);
      providerTrace.push({
        provider: provider.id,
        status: "failed",
        attempts: failure.options.retryable ? 2 : 1,
        durationMs: Date.now() - started,
        reason: failure.message,
      });
    }
  }
  const chain = providerTrace.map((entry) => {
    if (entry.status === "skipped") return `${entry.provider}: skipped (${entry.reason})`;
    return `${entry.provider}: failed (${entry.reason})`;
  }).join("; ");
  throw new WebToolError(
    failures.length > 0 ? `Web search provider chain failed (${chain}).` : `No web search provider is configured (${chain}).`,
    "provider_unavailable",
    { retryable: true, details: { providerTrace } },
  );
}
