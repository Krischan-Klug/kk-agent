import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const CONTENT_LIMIT = 12000;

function clamp(text: string, max = CONTENT_LIMIT): string {
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
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : null;
}

export async function executeWebSearchTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName === "web_search") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("query is required");
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(10, args.limit)) : 5;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 kk-agent" } });
    const html = await response.text();
    const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, limit);

    const results = matches.map((match, index) => {
      const rawUrl = decodeHtmlEntities(match[1]);
      const cleanUrl = rawUrl.startsWith("//duckduckgo.com/l/?uddg=")
        ? decodeURIComponent(rawUrl.split("uddg=")[1]?.split("&")[0] ?? rawUrl)
        : rawUrl;
      return `${index + 1}. Title: ${stripHtml(match[2])}\nURL: ${cleanUrl}\nSnippet: ${stripHtml(match[3])}`;
    });

    return { content: results.length ? results.join("\n\n") : "No search results found.", isError: false };
  }

  if (toolName === "fetch_url") {
    const url = String(args.url ?? "").trim();
    if (!url) throw new Error("url is required");
    const maxChars = typeof args.maxChars === "number" ? Math.max(500, Math.min(20000, args.maxChars)) : CONTENT_LIMIT;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 kk-agent" } });
    const html = await response.text();
    const text = stripHtml(html);
    const title = extractTitle(html);
    const content = [`URL: ${url}`, title ? `Title: ${title}` : null, "", clamp(text, maxChars)]
      .filter(Boolean)
      .join("\n");
    return { content, isError: false };
  }

  return null;
}
