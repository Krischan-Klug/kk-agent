import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initAgentService } from "./service.js";

export const AgentPlugin: ModulePlugin = {
  name: "agent",
  version: "0.1.0",
  description: "Multi-agent framework — define agents with custom loops, phases, and dynamic prompts.",
  deps: [{ name: "mcp" }],
  async beforeInit(_app, _context) {
    await initAgentService();
  },
  async init(app, _context) {
    app.use("/agent", routes);
  },
};

export default AgentPlugin;

export * from "./service.js";
export * from "./types.js";
