import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initMcpService, getAllMcps } from "./service.js";
import { startMcp } from "./lib/process-manager.js";
import { updateRegistry } from "./lib/registry.js";

export const McpPlugin: ModulePlugin = {
  name: "mcp",
  version: "0.1.0",
  description: "MCP server manager with tool registry.",
  async beforeInit(_app, _context) {
    await initMcpService();
    // Start all configured MCPs on boot
    const mcps = await getAllMcps();
    for (const mcp of mcps) {
      try {
        mcp.active = true;
        await startMcp(mcp);
        console.log(`[mcp] Started MCP: ${mcp.name}`);
      } catch (err) {
        console.error(`[mcp] Failed to start MCP "${mcp.name}":`, (err as Error).message);
      }
    }
    await updateRegistry(mcps);
  },
  async init(app, _context) {
    app.use("/mcp", routes);
  },
};

export default McpPlugin;

export * from "./service.js";
export * from "./types.js";
