import type { InternalToolDescriptor } from "../../types.js";

export const webSearchTools: InternalToolDescriptor[] = [
  {
    name: "WebSearch",
    description: "Search the web for current information and return source URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query to execute." },
        allowed_domains: {
          type: "array",
          items: { type: "string" },
          description: "Only include results from these domains.",
        },
        blocked_domains: {
          type: "array",
          items: { type: "string" },
          description: "Never include results from these domains.",
        },
      },
      required: ["query"],
    },
    capabilityId: "web-search",
  },
  {
    name: "WebFetch",
    description: "Fetch content from a URL and extract only the parts most relevant to the given prompt.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch." },
        prompt: { type: "string", description: "What information to extract from the page." },
      },
      required: ["url", "prompt"],
    },
    capabilityId: "web-search",
  },
];
