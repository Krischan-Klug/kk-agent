import type { ModulePlugin } from "../types.js";

export const CorePlugin: ModulePlugin = {
  name: "core",
  version: "0.1.0",
  description: "Minimal bootstrap plugin required by the plugin loader.",
  async init() {},
};

export default CorePlugin;
