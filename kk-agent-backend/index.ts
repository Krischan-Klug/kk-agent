import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { resolvePort } from "./src/runtime-config.js";
import { startServer } from "./src/server.js";
import { createLogger } from "./src/lib/logger.js";

const logger = createLogger("backend");

async function main(): Promise<void> {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = resolvePort(process.env.PORT);
  const started = await startServer({ host, port });

  logger.info(`Backend listening on http://${started.host}:${started.port}`);
  logger.info(`KK_AGENT_BACKEND_READY ${JSON.stringify({ host: started.host, port: started.port })}`);
}

void main().catch((error) => {
  logger.error("Failed to start", error);
  process.exit(1);
});
