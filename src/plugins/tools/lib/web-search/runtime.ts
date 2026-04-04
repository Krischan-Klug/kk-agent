import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const REQUEST_TIMEOUT = 10000;
const FETCH_CHAR_LIMIT = 12000;

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

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url);
    const html = await response.text();

    const matches = [
      ...html.matchAll(
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ];

    const results = matches
      .map((match) => {
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
      })
      .filter((entry) => (allowedDomains.length === 0 ? true : allowedDomains.includes(entry.host)))
      .filter((entry) => !blockedDomains.includes(entry.host))
      .slice(0, 8);

    if (results.length === 0) return { content: "No search results found.", isError: false };
    return {
      content: results
        .map((entry, index) => `${index + 1}. [${entry.title}](${entry.url})\nSnippet: ${entry.snippet}`)
        .join("\n\n"),
      isError: false,
    };
  }

  if (toolName === "WebFetch") {
    const url = String(args.url ?? "").trim();
    const prompt = String(args.prompt ?? "").trim();
    if (!url) throw new Error("url is required");
    if (!prompt) throw new Error("prompt is required");

    const response = await fetchWithTimeout(url);
    const html = await response.text();
    const markdown = htmlToText(html);
    const title = extractTitle(html);
    const extracted = extractRelevantSections(markdown, prompt);

    return {
      content: [
        `URL: ${url}`,
        title ? `Title: ${title}` : null,
        `Prompt: ${prompt}`,
        "",
        extracted,
      ]
        .filter(Boolean)
        .join("\n"),
      isError: false,
    };
  }

  return null;
}
