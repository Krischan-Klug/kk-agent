import type { ModulePlugin } from "../types.js";
import { initToolsService } from "./service.js";
import routes from "./routes.js";

export const ToolsPlugin: ModulePlugin = {
  name: "tools",
  version: "0.1.0",
  description: "Built-in local tools for filesystem, web search and terminal access.",
  async beforeInit() {
    await initToolsService();
  },
  init(app) {
    app.use("/tools", routes);
  },
};

export default ToolsPlugin;

export * from "./service.js";
export * from "./types.js";
