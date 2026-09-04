# Web Search architecture

The internal web tool has four layers:

1. `runtime.ts` implements the model-facing `WebSearch`, `WebOpen`, `WebFind`, and legacy `WebFetch` operations, caching, in-flight deduplication, and source projection.
2. `search-provider.ts` schedules the built-in Bing HTML provider with serialized, paced access, one bounded retry for transient failures, relevance ranking, and one focused query refinement only when Bing returns an evidently broken batch.
3. `network.ts` owns all HTTP access. It validates every redirect, pins DNS resolution for each request, blocks private/reserved networks, enforces a total deadline, and limits response bytes.
4. `extract.ts` converts HTML, text, JSON, and PDFs to bounded Markdown. It compares reader-mode and page-main candidates instead of trusting a weak extraction. `source-registry.ts` gives every canonical URL a deterministic source ID and carries verified source metadata across tool calls and turns.

Search snippets and opened pages are explicitly marked as untrusted content. Every result names Bing as its provider. Normal results are retained and only ranked, leaving source judgment to the agent. A batch is discarded only when it still has no lexical connection to the query after refinement. There is no cross-query or cross-session relevance state. Cache hits preserve the original provider provenance without claiming that a new provider request ran. Bing tracking redirects are decoded before canonical source IDs or domain filters are calculated.

## Search backend

The built-in Bing HTML search requires no API key, environment variable, separate service, or user setup. Search results are cached for ten minutes, identical in-flight searches share one provider request, and provider access is serialized and paced. Only timeouts, network failures, HTTP 408/429, and HTTP 5xx responses are retried once; blocked or unrecognized pages are not retried.

`allowed_domains` and `blocked_domains` are optional per-call controls, not global lists. With neither parameter, search is unrestricted across public web domains. When supplied, Bing receives matching `site:` hints and the decoded results are filtered locally as the authoritative check. These content filters are independent from the always-on SSRF protection for private and reserved network addresses.

`recency_days` maps to Bing's freshness hint and is best-effort. Publication and modification dates are exposed only when the result or opened page provides explicit semantic metadata.
