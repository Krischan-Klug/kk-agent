import type { Express } from "express";
import routes from "./routes.js";
import { initMcpService, getAllMcps } from "./service.js";
import { startMcp } from "./lib/process-manager.js";

export default async function initMcp(app: Express): Promise<void> {
  await initMcpService();
  const mcps = await getAllMcps();
  for (const mcp of mcps) {
    if (!mcp.active) continue;
    await startMcp(mcp);
  }
  app.use("/mcp", routes);
}
