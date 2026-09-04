export type WebSearchDepth = "low" | "medium" | "high";

export interface WebSearchOptions {
  allowedDomains: string[];
  blockedDomains: string[];
  maxResults: number;
  recencyDays?: number;
  locale?: string;
  depth: WebSearchDepth;
  abortSignal?: AbortSignal;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  host: string;
  publishedAt?: string;
}

export interface WebSearchResponse {
  provider: string;
  query: string;
  results: WebSearchResult[];
  durationMs: number;
  providerTrace?: WebSearchProviderTrace[];
}

export interface WebSearchProviderTrace {
  provider: string;
  status: "skipped" | "failed" | "succeeded";
  attempts: number;
  durationMs: number;
  selectedProvider?: string;
  reason?: string;
}

export interface WebSearchProvider {
  readonly id: string;
  isAvailable(): boolean;
  search(query: string, options: WebSearchOptions): Promise<WebSearchResponse>;
}

export interface WebResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  redirects: string[];
  durationMs: number;
}

export interface ExtractedWebDocument {
  url: string;
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  publishedAt?: string;
  contentType: string;
  text: string;
  markdown: string;
  links: Array<{ id: string; text: string; url: string }>;
  pageCount?: number;
}

export interface WebSourceRecord {
  id: string;
  url: string;
  host: string;
  title: string;
  snippet?: string;
  provider: string;
  query?: string;
  publishedAt?: string;
  fetchedAt?: string;
  contentType?: string;
  httpStatus?: number;
  links?: Array<{ id: string; text: string; url: string }>;
}
