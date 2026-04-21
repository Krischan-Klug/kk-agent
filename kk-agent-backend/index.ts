import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { resolvePort } from "./src/runtime-config.js";
import { startServer } from "./src/server.js";

async function main(): Promise<void> {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = resolvePort(process.env.PORT);
  const started = await startServer({ host, port });

  console.log(`Backend listening on http://${started.host}:${started.port}`);
  console.log(`KK_AGENT_BACKEND_READY ${JSON.stringify({ host: started.host, port: started.port })}`);
}

void main().catch((error) => {
  console.error("[backend] Failed to start", error);
  process.exit(1);
});
