import type { WebSearchOptions, WebSearchResult } from "./types.js";

export function normalizeSearchDomain(value: string): string {
  try {
    const trimmed = value.trim().toLowerCase();
    return trimmed ? new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname : "";
  } catch {
    return "";
  }
}

export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function filterResultsByDomains(
  results: WebSearchResult[],
  options: Pick<WebSearchOptions, "allowedDomains" | "blockedDomains">,
): WebSearchResult[] {
  const allowed = options.allowedDomains.map(normalizeSearchDomain).filter(Boolean);
  const blocked = options.blockedDomains.map(normalizeSearchDomain).filter(Boolean);
  return results
    .filter((result) => allowed.length === 0 || allowed.some((domain) => domainMatches(result.host, domain)))
    .filter((result) => !blocked.some((domain) => domainMatches(result.host, domain)));
}
