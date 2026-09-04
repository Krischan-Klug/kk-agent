import type { InternalToolDescriptor } from "../../types.js";

const sourceTargetProperties = {
  url: { type: "string", description: "Absolute HTTP(S) URL. Use either url or source_id." },
  source_id: { type: "string", description: "Stable source ID returned by WebSearch or WebOpen." },
  link_id: { type: "string", description: "Optional link ID from an opened source. Requires source_id." },
};

export const webSearchTools: InternalToolDescriptor[] = [
  {
    name: "WebSearch",
    description: "Search the web with one query or up to four parallel queries. Returns stable source IDs, clean target URLs, snippets, provider/fallback provenance, cache status, and optional publication dates. Open important sources before relying on detailed claims.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 1000, description: "A single search query. Use query or queries." },
        queries: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 1000 },
          description: "Up to four independent queries to run in parallel.",
        },
        allowed_domains: {
          type: "array",
          maxItems: 100,
          uniqueItems: true,
          items: { type: "string" },
          description: "Only include these domains and their subdomains. Schemes are optional.",
        },
        blocked_domains: {
          type: "array",
          maxItems: 100,
          uniqueItems: true,
          items: { type: "string" },
          description: "Exclude these domains and their subdomains.",
        },
        recency_days: { type: "integer", minimum: 1, maximum: 3650, description: "Prefer results from this many recent days." },
        locale: { type: "string", maxLength: 35, description: "Search locale or language, for example de-DE or en-US." },
        depth: { type: "string", enum: ["low", "medium", "high"], description: "Research breadth. Defaults to medium." },
        max_results: { type: "integer", minimum: 1, maximum: 10, description: "Maximum results per query." },
      },
      anyOf: [{ required: ["query"] }, { required: ["queries"] }],
      additionalProperties: false,
    },
  },
  {
    name: "WebOpen",
    description: "Open a URL, a WebSearch source, or a link from an opened source. Extracts readable HTML, text, JSON, or PDF content with line numbers and link IDs.",
    inputSchema: {
      type: "object",
      properties: {
        ...sourceTargetProperties,
        prompt: { type: "string", maxLength: 2000, description: "Optional topic used to select the most relevant sections." },
        line_start: { type: "integer", minimum: 1, description: "First extracted line to return." },
        line_count: { type: "integer", minimum: 1, maximum: 500, description: "Maximum extracted lines to return. Defaults to 200." },
      },
      anyOf: [{ required: ["url"] }, { required: ["source_id"] }],
      additionalProperties: false,
    },
  },
  {
    name: "WebFind",
    description: "Find literal text within an opened or directly addressed web page and return matching line contexts.",
    inputSchema: {
      type: "object",
      properties: {
        ...sourceTargetProperties,
        pattern: { type: "string", minLength: 1, maxLength: 300, description: "Literal case-insensitive text to find." },
        max_results: { type: "integer", minimum: 1, maximum: 25, description: "Maximum matching contexts. Defaults to 10." },
        context_lines: { type: "integer", minimum: 0, maximum: 8, description: "Lines of context on each side. Defaults to 2." },
      },
      required: ["pattern"],
      anyOf: [{ required: ["url"] }, { required: ["source_id"] }],
      additionalProperties: false,
    },
  },
  {
    name: "WebFetch",
    description: "Compatibility alias for WebOpen. Fetch a URL and extract sections relevant to a prompt.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute HTTP(S) URL to fetch." },
        prompt: { type: "string", maxLength: 2000, description: "Information to extract from the page." },
      },
      required: ["url", "prompt"],
      additionalProperties: false,
    },
  },
];
