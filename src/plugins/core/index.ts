import type { Request, Response } from "express";
import type { ModulePlugin } from "../types.js";

export const CorePlugin: ModulePlugin = {
  name: "core",
  version: "0.1.0",
  description: "Core endpoints and bootstrap utilities required before any feature plugin loads.",
  async init(app) {
    app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));
  },
};

export default CorePlugin;
