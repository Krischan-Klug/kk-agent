import { parseHTML } from "linkedom";
import { filterResultsByDomains, normalizeSearchDomain } from "../domains.js";
import { WebToolError } from "../errors.js";
import { requireSuccessfulStatus, safeFetch } from "../network.js";
import { normalizedSourceUrl } from "../source-registry.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResponse, WebSearchResult } from "../types.js";

function augmentQuery(query: string, options: WebSearchOptions): string {
  const allowed = options.allowedDomains.map(normalizeSearchDomain).filter(Boolean);
  const blocked = options.blockedDomains.map(normalizeSearchDomain).filter(Boolean);
  return `${query}${allowed.length ? ` (${allowed.map((domain) => `site:${domain}`).join(" OR ")})` : ""}${blocked.map((domain) => ` -site:${domain}`).join("")}`;
}

function freshness(days?: number): string | undefined {
  if (!days) return undefined;
  if (days <= 1) return "Day";
  if (days <= 7) return "Week";
  if (days <= 31) return "Month";
  return "Year";
}

export function decodeBingResultUrl(input: string, baseUrl = "https://www.bing.com/search"): string | undefined {
  try {
    const parsed = new URL(input, baseUrl);
    const host = parsed.hostname.toLowerCase();
    const isBingHost = host === "bing.com" || host.endsWith(".bing.com");
    const isBingRedirect = isBingHost && parsed.pathname.startsWith("/ck/a");
    if (!isBingRedirect) {
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
      return normalizedSourceUrl(parsed.toString());
    }

    const encoded = parsed.searchParams.get("u");
    if (!encoded) return undefined;
    const candidate = /^https?:\/\//iu.test(encoded)
      ? encoded
      : Buffer.from(encoded.startsWith("a1") ? encoded.slice(2) : encoded, "base64url").toString("utf8");
    const target = new URL(candidate);
    if (target.protocol !== "http:" && target.protocol !== "https:") return undefined;
    return normalizedSourceUrl(target.toString());
  } catch {
    return undefined;
  }
}

function parseBingDocument(document: Document, baseUrl: string): WebSearchResult[] {
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const item of [...document.querySelectorAll("li.b_algo")]) {
    const anchor = item.querySelector("h2 a[href]");
    if (!anchor) continue;
    const resultUrl = decodeBingResultUrl(anchor.getAttribute("href") ?? "", baseUrl);
    if (!resultUrl || seen.has(resultUrl)) continue;
    const title = (anchor.textContent ?? "").replace(/\s+/gu, " ").trim();
    if (!title) continue;
    seen.add(resultUrl);
    results.push({
      title,
      url: resultUrl,
      host: new URL(resultUrl).hostname.toLowerCase(),
      snippet: (item.querySelector(".b_caption p")?.textContent ?? "").replace(/\s+/gu, " ").trim(),
    });
  }
  return results;
}

export function parseBingResults(html: string, baseUrl: string): WebSearchResult[] {
  return parseBingDocument(parseHTML(html).document as unknown as Document, baseUrl);
}

export class BingSearchProvider implements WebSearchProvider {
  readonly id = "bing-html";

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, options: WebSearchOptions): Promise<WebSearchResponse> {
    const started = Date.now();
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", augmentQuery(query, options));
    url.searchParams.set("count", String(Math.max(10, options.maxResults)));
    if (options.locale) url.searchParams.set("mkt", options.locale);
    const fresh = freshness(options.recencyDays);
    if (fresh) url.searchParams.set("freshness", fresh);
    const resource = await safeFetch(url.toString(), {
      abortSignal: options.abortSignal,
      maxBytes: 3 * 1024 * 1024,
      timeoutMs: 12_000,
    });
    requireSuccessfulStatus(resource);
    const html = resource.body.toString("utf8");
    if (/captcha|unusual traffic|verify you are human/iu.test(html)) {
      throw new WebToolError("Bing rejected the automated search request.", "provider_blocked", { retryable: true });
    }
    const { document } = parseHTML(html);
    const parsedResults = parseBingDocument(document as unknown as Document, resource.finalUrl);
    const results = filterResultsByDomains(parsedResults, options).slice(0, options.maxResults);
    if (parsedResults.length === 0 && !document.querySelector(".b_no")) {
      throw new WebToolError("Bing returned an unrecognized or empty result page.", "provider_unavailable", { retryable: true });
    }
    return { provider: this.id, query, results, durationMs: Date.now() - started };
  }
}
