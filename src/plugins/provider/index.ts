import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { configure, initState, autoSelectModel } from "./service.js";

export const ProviderPlugin: ModulePlugin = {
  name: "provider",
  version: "0.2.0",
  description: "Multi-provider LLM support (LM Studio, OpenAI, Anthropic).",
  async init(app, context) {
    const settings = context.settings as { baseUrl?: string; activeModel?: string };
    configure(settings);
    await initState();
    await autoSelectModel();
    app.use("/provider", routes);
  },
};

export default ProviderPlugin;

export * from "./service.js";
export * from "./types.js";
