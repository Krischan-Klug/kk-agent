import type { ModulePlugin } from "../types.js";

export const SystempromptPlugin: ModulePlugin = {
  name: "systemprompt",
  version: "0.1.0",
  description: "Dynamic system prompt builder with MCP instructions.",
  deps: [{ name: "mcp" }, { name: "tools" }],
  init() {},
};

export default SystempromptPlugin;

export * from "./service.js";
