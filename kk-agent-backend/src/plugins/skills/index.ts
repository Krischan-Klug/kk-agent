import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";
import { initSkillService } from "./service.js";

const SkillsPlugin: ModulePlugin = {
  name: "skills",
  version: "0.1.0",
  description: "Local developer-curated skills stored in state/skills as SKILL.md bundles.",
  deps: [
    { name: "tools" },
    { name: "mcp" },
  ],
  async beforeInit() {
    await initSkillService();
  },
  init(app) {
    app.use("/skills", routes);
  },
};

export default SkillsPlugin;

export * from "./service.js";
export * from "./types.js";
