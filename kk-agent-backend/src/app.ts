import express, { Request, Response } from "express";
import cors from "cors";
import initPlugins from "./plugins/register-plugins.js";
import { errorMiddleware } from "./lib/error-middleware.js";
import { requireLocalApiToken } from "./lib/local-auth.js";
import hostRoutes from "./lib/host-routes.js";

function allowedOrigins(): Set<string> {
  const configured = process.env.KK_AGENT_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "app://-",
    ...configured,
  ]);
}

export async function createApp() {
  const app = express();
  const origins = allowedOrigins();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origins.has(origin) || origin.startsWith("app://")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }));
  app.use(express.json());

  app.get("/healthz", (_req: Request, res: Response) => res.json({ ok: true }));
  app.use("/internal/host", hostRoutes);
  app.use(requireLocalApiToken);

  await initPlugins(app);

  app.use((_req: Request, res: Response) =>
    res.status(404).json({ error: "Not found" })
  );

  app.use(errorMiddleware);

  return app;
}
