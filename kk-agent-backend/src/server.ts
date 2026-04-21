import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { createApp } from "./app.js";

export interface StartedServer {
  app: Express;
  server: Server;
  host: string;
  port: number;
}

export async function startServer(options: { host?: string; port?: number } = {}): Promise<StartedServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3001;
  const app = await createApp();
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not expose a TCP address.");
  }

  return {
    app,
    server,
    host,
    port: (address as AddressInfo).port,
  };
}
