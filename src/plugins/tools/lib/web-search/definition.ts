import type { McpServerConfig } from "../../../mcp/types.js";

export const webSearchDefinition: McpServerConfig = {
  id: "web-search",
  name: "Web Search",
  active: true,
  instruction:
    "Use web_search to discover relevant sources for current information, news, prices, versions, and anything that may have changed. " +
    "Use fetch_url to read a specific page after discovery. " +
    "Prefer targeted searches and fetch the most relevant pages instead of browsing too broadly. " +
    "Cite sources whenever you use information from web results or fetched pages.",
  emoji: "🌐",
  source: "system",
  systemKey: "web-search",
  transport: "stdio",
  server: { command: "internal", args: [] },
};
