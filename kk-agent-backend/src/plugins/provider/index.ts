import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initState } from "./service.js";

const ProviderPlugin: ModulePlugin = {
  name: "provider",
  version: "0.3.0",
  description: "Provider registry with unified model capabilities and endpoint mapping.",
  async init(app) {
    await initState();
    app.use("/provider", routes);
  },
};

export default ProviderPlugin;

export * from "./service.js";
export * from "./types.js";
