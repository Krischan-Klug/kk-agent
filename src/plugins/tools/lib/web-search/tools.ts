import type { McpToolDefinition } from "../../../mcp/types.js";

export const webSearchTools: McpToolDefinition[] = [
  {
    name: "web_search",
    description: "Search the web for relevant pages. Returns a compact result list with title, URL, and snippet so you can choose what to open next.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to run." },
        limit: { type: "number", description: "Maximum number of search results to return. Defaults to 5." },
      },
      required: ["query"],
    },
    mcpId: "web-search",
  },
  {
    name: "fetch_url",
    description: "Fetch a specific page and extract readable text content. Use this after search when you need to read the source itself.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The page URL to fetch." },
        maxChars: { type: "number", description: "Maximum number of characters to return from the extracted page text." },
      },
      required: ["url"],
    },
    mcpId: "web-search",
  },
];
