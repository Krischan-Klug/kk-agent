# Web Search architecture

The internal web tool is split into four layers:

1. `runtime.ts` implements the model-facing `WebSearch`, `WebOpen`, `WebFind`, and legacy `WebFetch` operations.
2. `search-provider.ts` selects a provider and applies bounded retries. The zero-configuration chain uses DuckDuckGo Lite/HTML, then Bing HTML.
3. `network.ts` owns all HTTP access. It validates every redirect, pins DNS resolution for each request, blocks private/reserved networks, enforces a total deadline, and limits response bytes.
4. `extract.ts` converts HTML, text, JSON, and PDFs to bounded Markdown. `source-registry.ts` gives every canonical URL a deterministic source ID and carries verified source metadata across tool calls and turns.

Search snippets and opened pages are explicitly marked as untrusted content. Source metadata is persisted in the transcript and rendered as external links by the desktop client.

Every search result names its selected provider. Each response also reports the complete provider trace, including unavailable, failed, retried, and successful providers. Search and document cache hits are visible in both model-facing output and structured metadata. Bing tracking redirects are decoded before canonical source IDs or domain filters are calculated.

## Search backend

The built-in provider chain requires no user configuration. It attempts DuckDuckGo first and automatically falls back to Bing. Both providers use the same result normalization, domain filtering, source registry, safety layer, and observable provider trace.

No API key, environment variable, separate service, or user setup is needed.
