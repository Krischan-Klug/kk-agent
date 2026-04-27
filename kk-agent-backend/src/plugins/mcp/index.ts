import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initMcpService, getAllMcps } from "./service.js";
import { startMcp } from "./lib/process-manager.js";
import { createLogger } from "../../lib/logger.js";
import { getErrorMessage } from "../../lib/error.js";

const logger = createLogger("mcp");

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
        logger.info(`Started MCP: ${mcp.name}`);
      } catch (err) {
        logger.error(`Failed to start MCP "${mcp.name}":`, getErrorMessage(err));
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
