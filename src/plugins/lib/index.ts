import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";

export const LibPlugin: ModulePlugin = {
  name: "lib",
  version: "0.1.0",
  description: "Auto-generated plugin 'lib'.",
  async init(app, _context) {
    app.use("/lib", routes);
  },
};

export default LibPlugin;

export * from "./service.js";
export * from "./types.js";
