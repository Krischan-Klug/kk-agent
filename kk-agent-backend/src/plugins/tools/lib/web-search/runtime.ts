import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const REQUEST_TIMEOUT = 10000;
const FETCH_CHAR_LIMIT = 12000;
const FETCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n\n[truncated]` : text;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "")
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : null;
}

function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 kk-agent" },
    signal: controller.signal,
    redirect: "follow",
  }).finally(() => clearTimeout(timer));
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function domainMatches(host: string, filterDomain: string): boolean {
  const h = host.toLowerCase();
  const f = filterDomain.toLowerCase();
  if (h === f) return true;
  if (h.endsWith(`.${f}`)) return true;
  return false;
}

function isBinaryContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes("image/") ||
    ct.includes("video/") ||
    ct.includes("audio/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip") ||
    ct.includes("application/octet-stream") ||
    ct.includes("application/x-binary")
  );
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024);
  let nullBytes = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nullBytes++;
  }
  return nullBytes > 0;
}

function validateUrl(input: string): { url: string; upgraded: boolean } | { error: string } {
  let url = input.trim();
  if (!url) return { error: "url is required" };
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: `Unsupported protocol: ${parsed.protocol}` };
    }
    const upgraded = parsed.protocol === "http:";
    if (upgraded) {
      parsed.protocol = "https:";
    }
    return { url: parsed.toString(), upgraded: upgraded };
  } catch {
    return { error: `Invalid URL: ${input}` };
  }
}

interface CacheEntry {
  url: string;
  markdown: string;
  contentType: string;
  title: string | null;
  createdAt: number;
}

const fetchCache = new Map<string, CacheEntry>();

function getCachedFetch(url: string): CacheEntry | undefined {
  const entry = fetchCache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > FETCH_CACHE_TTL_MS) {
    fetchCache.delete(url);
    return undefined;
  }
  return entry;
}

function setCachedFetch(url: string, entry: Omit<CacheEntry, "createdAt">): void {
  fetchCache.set(url, { ...entry, createdAt: Date.now() });
}

function extractRelevantSections(markdown: string, prompt: string): string {
  const words = [...new Set(
    prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4),
  )];

  if (words.length === 0) return clamp(markdown, FETCH_CHAR_LIMIT);

  const sections = markdown.split(/\n\s*\n/);
  const scored = sections
    .map((section) => {
      const lower = section.toLowerCase();
      const score = words.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0);
      return { section, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) return clamp(markdown, FETCH_CHAR_LIMIT);
  return clamp(scored.slice(0, 8).map((entry) => entry.section).join("\n\n"), FETCH_CHAR_LIMIT);
}

export async function executeWebSearchTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName === "WebSearch") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("query is required");

    const allowedDomains = Array.isArray(args.allowed_domains)
      ? args.allowed_domains.map((value) => String(value).toLowerCase())
      : [];
    const blockedDomains = Array.isArray(args.blocked_domains)
      ? args.blocked_domains.map((value) => String(value).toLowerCase())
      : [];

    if (allowedDomains.length > 0 && blockedDomains.length > 0) {
      return {
        content: "Cannot use both allowed_domains and blocked_domains at the same time. Use one or the other.",
        isError: true,
        metadata: { query, operation: "websearch" },
      };
    }

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url);
    const html = await response.text();

    const matches = [
      ...html.matchAll(
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ];

    const rawResults = matches.map((match) => {
      const rawUrl = decodeHtmlEntities(match[1]);
      const cleanUrl = rawUrl.startsWith("//duckduckgo.com/l/?uddg=")
        ? decodeURIComponent(rawUrl.split("uddg=")[1]?.split("&")[0] ?? rawUrl)
        : rawUrl;
      return {
        title: stripHtml(match[2]),
        url: cleanUrl,
        snippet: stripHtml(match[3]),
        host: hostname(cleanUrl),
      };
    });

    const filtered = rawResults
      .filter((entry) => {
        if (allowedDomains.length > 0) {
          return allowedDomains.some((d) => domainMatches(entry.host, d));
        }
        return true;
      })
      .filter((entry) => !blockedDomains.some((d) => domainMatches(entry.host, d)))
      .slice(0, 8);

    if (filtered.length === 0) {
      return {
        content: "No search results found.",
        isError: false,
        metadata: { query, sourceCount: 0, results: [] },
      };
    }

    const markdown = filtered
      .map((entry, index) => `${index + 1}. [${entry.title}](${entry.url})\n   ${entry.snippet}`)
      .join("\n\n");

    const sources = filtered.map((entry) => `- ${entry.host}`).join("\n");

    return {
      content: `${markdown}\n\n## Sources\n${sources}`,
      isError: false,
      metadata: {
        query,
        sourceCount: filtered.length,
        results: filtered.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, host: r.host })),
      },
    };
  }

  if (toolName === "WebFetch") {
    const rawUrl = String(args.url ?? "").trim();
    const prompt = String(args.prompt ?? "").trim();

    const validated = validateUrl(rawUrl);
    if ("error" in validated) {
      return {
        content: validated.error,
        isError: true,
        metadata: { url: rawUrl, operation: "webfetch" },
      };
    }

    const { url } = validated;
    const cached = getCachedFetch(url);

    let markdown: string;
    let title: string | null;
    let contentType: string;
    let finalUrl: string;
    let bytes: number;

    if (cached) {
      markdown = cached.markdown;
      title = cached.title;
      contentType = cached.contentType;
      finalUrl = cached.url;
      bytes = Buffer.byteLength(markdown, "utf-8");
    } else {
      const response = await fetchWithTimeout(url);
      finalUrl = response.url;

      // Detect cross-host redirect
      try {
        const originalHost = new URL(url).hostname.toLowerCase();
        const finalHost = new URL(finalUrl).hostname.toLowerCase();
        if (originalHost && finalHost && originalHost !== finalHost) {
          return {
            content: `The URL redirected to a different host (${finalHost}). Please fetch ${finalUrl} explicitly if you need that page.`,
            isError: false,
            metadata: { url, finalUrl, operation: "webfetch", crossHostRedirect: true },
          };
        }
      } catch {
        // ignore URL parse errors
      }

      contentType = response.headers.get("content-type") ?? "text/html";
      const buffer = Buffer.from(await response.arrayBuffer());
      bytes = buffer.length;

      if (isBinaryContentType(contentType) || isProbablyBinary(buffer)) {
        return {
          content: `Cannot fetch binary content (${contentType}) from ${url}.`,
          isError: true,
          metadata: { url, finalUrl, contentType, bytes, operation: "webfetch", binary: true },
        };
      }

      const html = buffer.toString("utf-8");
      markdown = htmlToText(html);
      title = extractTitle(html);

      setCachedFetch(url, { url: finalUrl, markdown, contentType, title });
    }

    const extracted = prompt ? extractRelevantSections(markdown, prompt) : clamp(markdown, FETCH_CHAR_LIMIT);
    const truncated = extracted.length < markdown.length;

    return {
      content: [
        `URL: ${url}`,
        finalUrl !== url ? `Final URL: ${finalUrl}` : null,
        title ? `Title: ${title}` : null,
        prompt ? `Prompt: ${prompt}` : null,
        "",
        extracted,
      ]
        .filter(Boolean)
        .join("\n"),
      isError: false,
      metadata: {
        url,
        finalUrl,
        title,
        contentType,
        bytes,
        truncated,
        operation: "webfetch",
      },
    };
  }

  return null;
}
