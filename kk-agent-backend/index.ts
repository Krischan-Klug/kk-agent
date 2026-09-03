import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { resolvePort } from "./src/runtime-config.js";
import { startServer } from "./src/server.js";
import { createLogger } from "./src/lib/logger.js";
import { stopAllBackgroundTerminalTasks } from "./src/plugins/tools/lib/terminal/background-tasks.js";
import { stopAllMcps } from "./src/plugins/mcp/lib/process-manager.js";

const logger = createLogger("backend");

async function main(): Promise<void> {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = resolvePort(process.env.PORT);
  const started = await startServer({ host, port });

  logger.info(`Backend listening on http://${started.host}:${started.port}`);
  // Machine-readable line consumed by the Electron main process. Keep it unprefixed.
  console.log(`KK_AGENT_BACKEND_READY ${JSON.stringify({ host: started.host, port: started.port })}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Stopping backend after ${signal}`);
    await Promise.all([stopAllBackgroundTerminalTasks(), stopAllMcps()]);
    await new Promise<void>((resolveClose) => started.server.close(() => resolveClose()));
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
  logger.error("Failed to start", error);
  process.exit(1);
});
