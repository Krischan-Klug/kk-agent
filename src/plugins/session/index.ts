import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";

export const SessionPlugin: ModulePlugin = {
  name: "session",
  version: "0.1.0",
  description: "Conversation session manager with frozen system prompts.",
  deps: [{ name: "provider" }, { name: "systemprompt" }, { name: "loop" }, { name: "agent" }],
  async init(app, _context) {
    app.use("/session", routes);
  },
};

export default SessionPlugin;

export * from "./service.js";
export * from "./types.js";
