import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";

export const CorePlugin: ModulePlugin = {
  name: "core",
  version: "0.1.0",
  description: "Auto-generated plugin 'core'.",
  async init(app, _context) {
    app.use("/core", routes);
  },
};

export default CorePlugin;

export * from "./service.js";
export * from "./types.js";
