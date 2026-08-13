import type { Express } from "express";
import { initToolsService } from "./service.js";
import routes from "./routes.js";

export default async function initTools(app: Express): Promise<void> {
  await initToolsService();
  app.use("/tools", routes);
}
