import type { ModulePlugin } from "../types.js";
import { initToolsService } from "./service.js";

export const ToolsPlugin: ModulePlugin = {
  name: "tools",
  version: "0.1.0",
  description: "Built-in local tools for filesystem, web search and terminal access.",
  async beforeInit() {
    await initToolsService();
  },
  init() {},
};

export default ToolsPlugin;

export * from "./service.js";
export * from "./types.js";
