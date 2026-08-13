import type { Express } from "express";
import routes from "./routes.js";
import { initAgentService } from "./service.js";

export default async function initAgent(app: Express): Promise<void> {
  await initAgentService();
  app.use("/agent", routes);
}
