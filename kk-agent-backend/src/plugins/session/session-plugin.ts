import type { Express } from "express";
import routes from "./session-routes.js";
import { initStore } from "./lib/store.js";
import { reconcileAssetStore } from "./lib/assets.js";

export default async function initSession(app: Express): Promise<void> {
  await initStore();
  await reconcileAssetStore();
  app.use("/session", routes);
}
