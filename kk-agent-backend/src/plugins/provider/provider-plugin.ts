import type { Express } from "express";
import routes from "./provider-routes.js";
import { initState } from "./service.js";

export default async function initProvider(app: Express): Promise<void> {
  await initState();
  app.use("/provider", routes);
}
