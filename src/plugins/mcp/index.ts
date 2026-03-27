import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initMcpService, getAllMcps } from "./service.js";
import { startMcp } from "./lib/process-manager.js";

export const McpPlugin: ModulePlugin = {
  name: "mcp",
  version: "0.1.0",
  description: "Custom MCP server manager with tool registry.",
  async beforeInit(_app, _context) {
    await initMcpService();
    const mcps = await getAllMcps();
    for (const mcp of mcps) {
      if (!mcp.active) continue;
      try {
        await startMcp(mcp);
        console.log(`[mcp] Started MCP: ${mcp.name}`);
      } catch (err) {
        console.error(`[mcp] Failed to start MCP "${mcp.name}":`, (err as Error).message);
      }
    }
  },
  async init(app, _context) {
    app.use("/mcp", routes);
  },
};

export default McpPlugin;

export * from "./service.js";
export * from "./types.js";
