import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";

export const LoopPlugin: ModulePlugin = {
  name: "loop",
  version: "0.1.0",
  description: "Agent loop — turns an LLM into an autonomous agent by orchestrating tool calls.",
  deps: [{ name: "provider" }, { name: "mcp" }, { name: "agent" }, { name: "systemprompt" }],
  async init(app, _context) {
    app.use("/loop", routes);
  },
};

export default LoopPlugin;

export * from "./service.js";
export * from "./types.js";
