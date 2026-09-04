import type { InternalToolDefinition } from "../../types.js";
import type { ToolExecutionResult, ToolRuntimeContext } from "../../../loop/types.js";
import { TtlLruCache } from "./cache.js";
import { asWebToolError, WebToolError } from "./errors.js";
import { extractWebDocument } from "./extract.js";
import { requireSuccessfulStatus, safeFetch } from "./network.js";
import { searchWeb } from "./search-provider.js";
import {
  normalizedSourceUrl,
  resolveRegisteredSource,
  sourceIdForUrl,
  withWebSources,
} from "./source-registry.js";
import type {
  ExtractedWebDocument,
  WebResource,
  WebSearchDepth,
  WebSearchResponse,
  WebSearchResult,
  WebSourceRecord,
} from "./types.js";

const DOCUMENT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;
const MAX_QUERY_LENGTH = 1_000;
const MAX_PROMPT_LENGTH = 2_000;
const MAX_PATTERN_LENGTH = 300;
const MAX_OPEN_LINES = 500;

interface CachedDocument {
  resource: WebResource;
  document: ExtractedWebDocument;
}

const documentCache = new TtlLruCache<CachedDocument>(64, DOCUMENT_CACHE_TTL_MS);
const searchCache = new TtlLruCache<WebSearchResponse>(100, SEARCH_CACHE_TTL_MS);

function stringArg(args: Record<string, unknown>, name: string, maxLength: number, required = false): string {
  const value = typeof args[name] === "string" ? args[name].trim() : "";
  if (required && !value) throw new WebToolError(`${name} is required.`, "invalid_input");
  if (value.length > maxLength) throw new WebToolError(`${name} exceeds the ${maxLength}-character limit.`, "invalid_input");
  return value;
}

function numberArg(args: Record<string, unknown>, name: string, fallback: number, min: number, max: number): number {
  const candidate = args[name];
  const value = typeof candidate === "number" && Number.isFinite(candidate) ? Math.floor(candidate) : fallback;
  return Math.min(max, Math.max(min, value));
}

function domainArgs(args: Record<string, unknown>, name: string): string[] {
  if (args[name] === undefined) return [];
  if (!Array.isArray(args[name])) throw new WebToolError(`${name} must be an array.`, "invalid_input");
  if (args[name].length > 100) throw new WebToolError(`${name} accepts at most 100 domains.`, "invalid_input");
  const domains = args[name].map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new WebToolError(`${name} contains an invalid domain.`, "invalid_input");
    try {
      return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
    } catch {
      throw new WebToolError(`${name} contains an invalid domain: ${String(value)}`, "invalid_input");
    }
  });
  return [...new Set(domains)];
}

function queryArgs(args: Record<string, unknown>): string[] {
  const singular = stringArg(args, "query", MAX_QUERY_LENGTH);
  let multiple: string[] = [];
  if (args.queries !== undefined) {
    if (!Array.isArray(args.queries)) throw new WebToolError("queries must be an array.", "invalid_input");
    multiple = args.queries.map((value) => typeof value === "string" ? value.trim() : "");
  }
  const queries = [...new Set([singular, ...multiple].filter(Boolean))];
  if (queries.length === 0) throw new WebToolError("query or queries is required.", "invalid_input");
  if (queries.length > 4) throw new WebToolError("At most four search queries may be submitted at once.", "invalid_input");
  if (queries.some((query) => query.length > MAX_QUERY_LENGTH)) {
    throw new WebToolError(`Each query is limited to ${MAX_QUERY_LENGTH} characters.`, "invalid_input");
  }
  return queries;
}

function depthArg(value: unknown): WebSearchDepth {
  return value === "low" || value === "high" ? value : "medium";
}

function sourceRecord(result: WebSearchResult, response: WebSearchResponse): WebSourceRecord {
  return {
    id: sourceIdForUrl(result.url),
    url: normalizedSourceUrl(result.url),
    host: result.host,
    title: result.title,
    snippet: result.snippet,
    provider: response.provider,
    query: response.query,
    publishedAt: result.publishedAt,
  };
}

function formatSearchSource(source: WebSourceRecord, index: number): string {
  return [
    `${index + 1}. [${source.id}] ${source.title}`,
    `   URL: ${source.url}`,
    `   Provider: ${source.provider}`,
    source.publishedAt ? `   Published: ${source.publishedAt}` : null,
    source.snippet ? `   ${source.snippet}` : null,
  ].filter(Boolean).join("\n");
}

function formatProviderTrace(response: WebSearchResponse): string {
  const trace = response.providerTrace ?? [{
    provider: response.provider,
    status: "succeeded" as const,
    attempts: 1,
    durationMs: response.durationMs,
    selectedProvider: response.provider,
  }];
  const steps = trace.map((entry) => {
    if (entry.status === "skipped") return `${entry.provider}=skipped (${entry.reason ?? "unavailable"})`;
    if (entry.status === "failed") return `${entry.provider}=failed after ${entry.attempts} attempt(s) (${entry.reason ?? "unknown error"})`;
    return `${entry.provider}=succeeded as ${entry.selectedProvider ?? entry.provider} after ${entry.attempts} attempt(s)`;
  });
  return `Provider chain for ${JSON.stringify(response.query)}: ${steps.join(" -> ")}`;
}

function cacheKey(query: string, options: object): string {
  return JSON.stringify([query, options]);
}


async function executeSearch(args: Record<string, unknown>, context?: ToolRuntimeContext): Promise<ToolExecutionResult> {
  const queries = queryArgs(args);
  const allowedDomains = domainArgs(args, "allowed_domains");
  const blockedDomains = domainArgs(args, "blocked_domains");
  const depth = depthArg(args.depth);
  const defaultResults = depth === "low" ? 5 : depth === "high" ? 10 : 8;
  const maxResults = numberArg(args, "max_results", defaultResults, 1, 10);
  const recencyDays = args.recency_days === undefined ? undefined : numberArg(args, "recency_days", 30, 1, 3650);
  const locale = stringArg(args, "locale", 35);
  const started = Date.now();
  const commonOptions = { allowedDomains, blockedDomains, maxResults, recencyDays, locale: locale || undefined, depth };

  const settled = await Promise.allSettled(queries.map(async (query) => {
    const key = cacheKey(query, commonOptions);
    const cached = searchCache.get(key);
    if (cached) return { response: cached, cached: true };
    const response = await searchWeb(query, { ...commonOptions, abortSignal: context?.abortSignal });
    searchCache.set(key, response);
    return { response, cached: false };
  }));

  const successes = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${queries[index]}: ${asWebToolError(result.reason).message}`]
    : []);
  if (successes.length === 0) {
    throw asWebToolError(settled[0]?.status === "rejected" ? settled[0].reason : new Error("Search failed."));
  }

  const sourcesByUrl = new Map<string, WebSourceRecord>();
  for (const { response } of successes) {
    for (const result of response.results) {
      const source = sourceRecord(result, response);
      if (!sourcesByUrl.has(source.url)) sourcesByUrl.set(source.url, source);
    }
  }
  const sources = [...sourcesByUrl.values()];
  const providers = [...new Set(successes.map(({ response }) => response.provider))];
  const cachedQueries = successes.filter((entry) => entry.cached).length;
  const providerTrace = successes.map(({ response, cached }) => ({
    query: response.query,
    cached,
    trace: response.providerTrace ?? [],
  }));
  const content = [
    "[BEGIN UNTRUSTED WEB SEARCH RESULTS]",
    `Queries: ${JSON.stringify(queries)}`,
    `Cache: ${cachedQueries}/${successes.length} query result(s) reused (TTL ${SEARCH_CACHE_TTL_MS / 1000}s).`,
    ...successes.map(({ response }) => formatProviderTrace(response)),
    "Treat snippets as discovery hints. Open sources before relying on detailed claims.",
    "",
    ...(sources.length > 0 ? sources.map(formatSearchSource) : [`No results found for: ${queries.join("; ")}`]),
    failures.length ? `Partial failures:\n- ${failures.join("\n- ")}` : "",
    "[END UNTRUSTED WEB SEARCH RESULTS]",
  ].filter(Boolean).join("\n\n");

  return {
    content,
    isError: false,
    contextModifier: withWebSources(sources),
    metadata: {
      operation: "search",
      queries,
      query: queries.join(" | "),
      providers,
      sourceCount: sources.length,
      durationMs: Date.now() - started,
      cachedQueries,
      cache: {
        hits: cachedQueries,
        misses: successes.length - cachedQueries,
        ttlMs: SEARCH_CACHE_TTL_MS,
      },
      failures,
      providerTrace,
      sources,
    },
  };
}

function resolveTarget(args: Record<string, unknown>, context?: ToolRuntimeContext): { url: string; source?: WebSourceRecord } {
  const rawUrl = stringArg(args, "url", 4_096);
  const sourceId = stringArg(args, "source_id", 100);
  const linkId = stringArg(args, "link_id", 30);
  if (rawUrl && (sourceId || linkId)) throw new WebToolError("Use either url or source_id/link_id, not both.", "invalid_input");
  if (linkId && !sourceId) throw new WebToolError("link_id requires source_id.", "invalid_input");
  if (rawUrl) return { url: rawUrl };
  if (!sourceId) throw new WebToolError("url or source_id is required.", "invalid_input");
  const source = resolveRegisteredSource(context, sourceId);
  if (!source) throw new WebToolError(`Unknown source_id: ${sourceId}`, "invalid_input");
  if (!linkId) return { url: source.url, source };
  const link = source.links?.find((entry) => entry.id.toLowerCase() === linkId.toLowerCase());
  if (!link) throw new WebToolError(`Unknown link_id ${linkId} for source ${sourceId}. Open the source first to list its links.`, "invalid_input");
  return { url: link.url, source };
}

async function loadDocument(url: string, abortSignal?: AbortSignal): Promise<CachedDocument & { cacheHit: boolean }> {
  const normalized = normalizedSourceUrl(url);
  const cached = documentCache.get(normalized);
  if (cached) return { ...cached, cacheHit: true };
  const resource = await safeFetch(normalized, {
    abortSignal,
    maxBytes: MAX_FETCH_BYTES,
    timeoutMs: 20_000,
  });
  requireSuccessfulStatus(resource);
  const document = await extractWebDocument(resource);
  const value = { resource, document };
  documentCache.set(normalized, value);
  documentCache.set(normalizedSourceUrl(resource.finalUrl), value);
  return { ...value, cacheHit: false };
}

const STOP_WORDS = new Set([
  "about", "after", "also", "and", "auf", "aus", "bei", "das", "dem", "den", "der", "die", "ein", "eine",
  "for", "from", "hat", "how", "ist", "mit", "nach", "oder", "the", "this", "und", "von", "was", "what",
  "when", "where", "which", "who", "wie", "with", "you", "zum", "zur",
]);

function terms(value: string): string[] {
  const matches = value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(matches.filter((word) => !STOP_WORDS.has(word)))];
}

function selectRelevantMarkdown(markdown: string, prompt: string, maxChars = 24_000): string {
  if (!prompt.trim()) return markdown.slice(0, maxChars);
  const needles = terms(prompt);
  if (needles.length === 0) return markdown.slice(0, maxChars);
  const sections = markdown
    .split(/\n{2,}/gu)
    .map((section, index) => ({ section: section.trim(), index }))
    .filter((entry) => entry.section);
  const scored = sections.map((entry) => {
    const lower = entry.section.toLocaleLowerCase();
    const matches = needles.reduce((score, needle) => score + (lower.includes(needle) ? 2 : 0), 0);
    const phrase = lower.includes(prompt.toLocaleLowerCase()) ? 8 : 0;
    const heading = /^#{1,6}\s/u.test(entry.section) ? 1 : 0;
    return { ...entry, score: matches + phrase + heading };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  if (scored.length === 0) return markdown.slice(0, maxChars);

  const chosen = new Set<number>();
  for (const entry of scored) {
    chosen.add(entry.index);
    if (entry.index > 0) chosen.add(entry.index - 1);
    if (entry.index + 1 < sections.length) chosen.add(entry.index + 1);
    const current = [...chosen].sort((a, b) => a - b).map((index) => sections[index]?.section ?? "").join("\n\n");
    if (current.length >= maxChars || chosen.size >= 18) break;
  }
  return [...chosen]
    .sort((a, b) => a - b)
    .map((index) => sections[index]?.section ?? "")
    .join("\n\n")
    .slice(0, maxChars);
}

function numberedLines(value: string, startLine: number, lineCount: number): { content: string; start: number; end: number; total: number } {
  const lines = value.split("\n");
  const start = Math.min(lines.length || 1, Math.max(1, startLine));
  const end = Math.min(lines.length, start - 1 + lineCount);
  const width = String(Math.max(end, 1)).length;
  return {
    content: lines.slice(start - 1, end).map((line, index) => `${String(start + index).padStart(width)}\t${line}`).join("\n"),
    start,
    end,
    total: lines.length,
  };
}

function documentSource(document: ExtractedWebDocument, resource: WebResource, existing?: WebSourceRecord): WebSourceRecord {
  return {
    id: sourceIdForUrl(document.url),
    url: normalizedSourceUrl(document.url),
    host: new URL(document.url).hostname.toLowerCase(),
    title: document.title || existing?.title || document.url,
    snippet: document.excerpt || existing?.snippet,
    provider: existing?.provider ?? "direct-fetch",
    query: existing?.query,
    publishedAt: document.publishedAt || existing?.publishedAt,
    fetchedAt: new Date().toISOString(),
    contentType: document.contentType,
    httpStatus: resource.status,
    links: document.links.slice(0, 40),
  };
}

async function executeOpen(
  args: Record<string, unknown>,
  context: ToolRuntimeContext | undefined,
  legacyFetch = false,
): Promise<ToolExecutionResult> {
  const target = resolveTarget(args, context);
  const prompt = stringArg(args, "prompt", MAX_PROMPT_LENGTH);
  const loaded = await loadDocument(target.url, context?.abortSignal);
  const selected = prompt ? selectRelevantMarkdown(loaded.document.markdown, prompt) : loaded.document.markdown;
  const startLine = numberArg(args, "line_start", 1, 1, Number.MAX_SAFE_INTEGER);
  const defaultLineCount = legacyFetch ? 300 : 200;
  const lineCount = numberArg(args, "line_count", defaultLineCount, 1, MAX_OPEN_LINES);
  const lines = numberedLines(selected, startLine, lineCount);
  const source = documentSource(loaded.document, loaded.resource, target.source);
  const links = loaded.document.links.slice(0, 40);
  const linkList = links.length > 0
    ? ["Links:", ...links.map((link) => `- [${link.id}] ${link.text}: ${link.url}`)].join("\n")
    : "";

  return {
    content: [
      "[BEGIN UNTRUSTED WEB PAGE]",
      `Source-ID: ${source.id}`,
      `URL: ${source.url}`,
      `Title: ${source.title}`,
      source.publishedAt ? `Published: ${source.publishedAt}` : null,
      loaded.document.byline ? `Byline: ${loaded.document.byline}` : null,
      loaded.document.pageCount ? `Pages: ${loaded.document.pageCount}` : null,
      `HTTP-Status: ${loaded.resource.status}`,
      `Content-Type: ${source.contentType}`,
      `Cache: ${loaded.cacheHit ? "hit" : "miss"} (TTL ${DOCUMENT_CACHE_TTL_MS / 1000}s).`,
      `Lines: ${lines.start}-${lines.end} of ${lines.total}`,
      "",
      lines.content,
      linkList ? `\n${linkList}` : null,
      "[END UNTRUSTED WEB PAGE]",
    ].filter((value) => value !== null).join("\n"),
    isError: false,
    contextModifier: withWebSources([source]),
    metadata: {
      operation: legacyFetch ? "fetch" : "open",
      url: target.url,
      finalUrl: source.url,
      sourceId: source.id,
      title: source.title,
      contentType: source.contentType,
      status: loaded.resource.status,
      bytes: loaded.resource.body.length,
      redirects: loaded.resource.redirects,
      durationMs: loaded.resource.durationMs,
      cacheHit: loaded.cacheHit,
      cache: { hit: loaded.cacheHit, ttlMs: DOCUMENT_CACHE_TTL_MS },
      startLine: lines.start,
      endLine: lines.end,
      totalLines: lines.total,
      truncated: lines.end < lines.total,
      pageCount: loaded.document.pageCount,
      links,
      sources: [source],
    },
  };
}

async function executeFind(args: Record<string, unknown>, context?: ToolRuntimeContext): Promise<ToolExecutionResult> {
  const target = resolveTarget(args, context);
  const pattern = stringArg(args, "pattern", MAX_PATTERN_LENGTH, true);
  const maxResults = numberArg(args, "max_results", 10, 1, 25);
  const contextLines = numberArg(args, "context_lines", 2, 0, 8);
  const loaded = await loadDocument(target.url, context?.abortSignal);
  const source = documentSource(loaded.document, loaded.resource, target.source);
  const lines = loaded.document.markdown.split("\n");
  const needle = pattern.toLocaleLowerCase();
  const matches: Array<{ line: number; start: number; end: number; excerpt: string }> = [];
  for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
    if (!lines[index]!.toLocaleLowerCase().includes(needle)) continue;
    const start = Math.max(0, index - contextLines);
    const end = Math.min(lines.length, index + contextLines + 1);
    matches.push({
      line: index + 1,
      start: start + 1,
      end,
      excerpt: lines.slice(start, end).map((line, offset) => `${start + offset + 1}\t${line}`).join("\n"),
    });
  }
  const cacheLine = `Cache: ${loaded.cacheHit ? "hit" : "miss"} (TTL ${DOCUMENT_CACHE_TTL_MS / 1000}s).`;
  return {
    content: matches.length > 0
      ? [
          "[BEGIN UNTRUSTED WEB FIND RESULTS]",
          `Source-ID: ${source.id}`,
          `Pattern: ${JSON.stringify(pattern)}`,
          cacheLine,
          ...matches.map((match) => `[match at line ${match.line}; context ${match.start}-${match.end}]\n${match.excerpt}`),
          "[END UNTRUSTED WEB FIND RESULTS]",
        ].join("\n\n")
      : `${cacheLine}\nNo matches for ${JSON.stringify(pattern)} in [${source.id}] ${source.url}.`,
    isError: false,
    contextModifier: withWebSources([source]),
    metadata: {
      operation: "find",
      url: source.url,
      sourceId: source.id,
      pattern,
      matchCount: matches.length,
      matches: matches.map(({ line, start, end }) => ({ line, start, end })),
      cacheHit: loaded.cacheHit,
      cache: { hit: loaded.cacheHit, ttlMs: DOCUMENT_CACHE_TTL_MS },
      sources: [source],
    },
  };
}

function errorResult(error: unknown, operation: string, args: Record<string, unknown>): ToolExecutionResult {
  const resolved = asWebToolError(error, typeof args.url === "string" ? args.url : undefined);
  return {
    content: resolved.message,
    isError: true,
    metadata: {
      operation,
      errorKind: resolved.kind,
      status: resolved.options.status,
      retryable: resolved.options.retryable === true,
      url: resolved.options.url,
      ...resolved.options.details,
    },
  };
}

export async function executeWebSearchTool(
  _config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolExecutionResult | null> {
  try {
    if (toolName === "WebSearch") return await executeSearch(args, context);
    if (toolName === "WebOpen") return await executeOpen(args, context);
    if (toolName === "WebFetch") return await executeOpen(args, context, true);
    if (toolName === "WebFind") return await executeFind(args, context);
    return null;
  } catch (error) {
    return errorResult(error, toolName.replace(/^Web/u, "").toLowerCase(), args);
  }
}

export function clearWebCachesForTests(): void {
  documentCache.clear();
  searchCache.clear();
}
