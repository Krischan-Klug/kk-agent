import type { Express } from "express";
import routes from "./routes.js";
import { initSkillService } from "./service.js";

export default async function initSkills(app: Express): Promise<void> {
  await initSkillService();
  app.use("/skills", routes);
}
