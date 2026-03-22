import express, { Request, Response } from "express";
import cors from "cors";
import initPlugins from "./plugins/index.js";
import { initDefaults } from "./plugins/lib/defaults.js";
import defaultsRoutes from "./plugins/lib/defaults-routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

await initDefaults();
app.use("/settings/defaults", defaultsRoutes);

await initPlugins(app);

app.use((req: Request, res: Response) =>
  res.status(404).json({ error: "Not found" })
);

export default app;
