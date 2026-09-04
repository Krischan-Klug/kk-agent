import { parseHTML } from "linkedom";
import { filterResultsByDomains, normalizeSearchDomain } from "../domains.js";
import { WebToolError } from "../errors.js";
import { requireSuccessfulStatus, safeFetch } from "../network.js";
import { normalizedSourceUrl } from "../source-registry.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResponse, WebSearchResult } from "../types.js";

function decodeRedirectUrl(input: string, baseUrl: string): string | undefined {
  try {
    const parsed = new URL(input, baseUrl);
    const redirected = parsed.hostname.endsWith("duckduckgo.com") ? parsed.searchParams.get("uddg") : null;
    const target = new URL(redirected || parsed.toString());
    if (target.protocol !== "http:" && target.protocol !== "https:") return undefined;
    return normalizedSourceUrl(target.toString());
  } catch {
    return undefined;
  }
}

function augmentQuery(query: string, options: WebSearchOptions): string {
  const allowed = options.allowedDomains.map(normalizeSearchDomain).filter(Boolean);
  const blocked = options.blockedDomains.map(normalizeSearchDomain).filter(Boolean);
  const allowedClause = allowed.length > 0 ? ` (${allowed.map((domain) => `site:${domain}`).join(" OR ")})` : "";
  return `${query}${allowedClause}${blocked.map((domain) => ` -site:${domain}`).join("")}`.trim();
}

function recencyCode(days?: number): string | undefined {
  if (!days) return undefined;
  if (days <= 1) return "d";
  if (days <= 7) return "w";
  if (days <= 31) return "m";
  return "y";
}

export function parseDuckDuckGoResults(html: string, baseUrl: string): WebSearchResult[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  const append = (anchor: Element | null, snippetValue: string) => {
    const url = decodeRedirectUrl(anchor?.getAttribute("href") ?? "", baseUrl);
    if (!url || seen.has(url)) return;
    const title = (anchor?.textContent ?? "").replace(/\s+/gu, " ").trim();
    if (!title) return;
    seen.add(url);
    results.push({
      title,
      url,
      snippet: snippetValue.replace(/\s+/gu, " ").trim(),
      host: new URL(url).hostname.toLowerCase(),
    });
  };

  for (const container of [...document.querySelectorAll(".result, .web-result")]) {
    append(container.querySelector("a.result__a, a[href]"), container.querySelector(".result__snippet")?.textContent ?? "");
  }
  for (const anchor of [...document.querySelectorAll("a.result-link")]) {
    const row = anchor.parentElement?.parentElement;
    append(anchor, row?.nextElementSibling?.querySelector(".result-snippet")?.textContent ?? "");
  }
  return results;
}

function looksBlocked(html: string, status: number): boolean {
  const lower = html.toLowerCase();
  return status === 202
    || lower.includes("bots use duckduckgo")
    || lower.includes("anomaly-modal")
    || lower.includes("challenge-form");
}

export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = "duckduckgo";

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, options: WebSearchOptions): Promise<WebSearchResponse> {
    const started = Date.now();
    let lastFailure: WebToolError | undefined;
    for (const endpoint of ["https://lite.duckduckgo.com/lite/", "https://html.duckduckgo.com/html/"]) {
      const url = new URL(endpoint);
      url.searchParams.set("q", augmentQuery(query, options));
      const recency = recencyCode(options.recencyDays);
      if (recency) url.searchParams.set("df", recency);
      if (options.locale) url.searchParams.set("kl", options.locale);
      const resource = await safeFetch(url.toString(), {
        abortSignal: options.abortSignal,
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 12_000,
      });
      const html = resource.body.toString("utf8");
      if (looksBlocked(html, resource.status)) {
        lastFailure = new WebToolError("DuckDuckGo rejected the automated search request.", "provider_blocked", {
          status: resource.status,
          retryable: true,
          url: resource.finalUrl,
        });
        continue;
      }
      requireSuccessfulStatus(resource);
      const results = filterResultsByDomains(parseDuckDuckGoResults(html, resource.finalUrl), options)
        .slice(0, options.maxResults);
      if (results.length > 0 || /no results/iu.test(html)) {
        const variant = url.hostname.startsWith("lite.") ? "lite" : "html";
        return { provider: `${this.id}-${variant}`, query, results, durationMs: Date.now() - started };
      }
      lastFailure = new WebToolError("Search provider returned an unrecognized or empty result page.", "provider_unavailable", {
        retryable: true,
        url: resource.finalUrl,
      });
    }
    throw lastFailure ?? new WebToolError("DuckDuckGo search failed.", "provider_unavailable", { retryable: true });
  }
}
