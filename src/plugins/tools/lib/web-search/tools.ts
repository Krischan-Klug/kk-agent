import type { McpToolDefinition } from "../../../mcp/types.js";

export const webSearchTools: McpToolDefinition[] = [
  {
    name: "web_search",
    description: "Search the web. Returns title, URL, snippet per result.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        limit: { type: "number", description: "Max results (default: 5)." },
      },
      required: ["query"],
    },
    mcpId: "web-search",
  },
  {
    name: "fetch_url",
    description: "Fetch a page and extract readable text.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Page URL to fetch." },
        maxChars: { type: "number", description: "Max characters to return." },
      },
      required: ["url"],
    },
    mcpId: "web-search",
  },
];
