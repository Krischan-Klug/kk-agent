import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initStore } from "./lib/store.js";
import { initAttachmentStore } from "./lib/attachments.js";

export const SessionPlugin: ModulePlugin = {
  name: "session",
  version: "0.1.0",
  description: "Conversation session manager with persistent sessions.",
  deps: [{ name: "provider" }, { name: "tools" }, { name: "systemprompt" }, { name: "loop" }, { name: "agent" }],
  async init(app, _context) {
    await initStore();
    await initAttachmentStore();
    app.use("/session", routes);
  },
};

export default SessionPlugin;

export * from "./service.js";
export * from "./types.js";
