import type { Express } from "express";
import routes from "./security-routes.js";
import { initSecurityService } from "./service.js";

export default async function initSecurity(app: Express): Promise<void> {
  await initSecurityService();
  app.use("/settings/security", routes);
}
