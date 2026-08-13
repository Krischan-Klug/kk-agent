import type { Express } from "express";
import initTools from "./tools/index.js";
import initMcp from "./mcp/index.js";
import initSkills from "./skills/index.js";
import initProvider from "./provider/index.js";
import initAgent from "./agent/index.js";
import initSession from "./session/index.js";

const initializers = [initTools, initMcp, initSkills, initProvider, initAgent, initSession];

export default async function initPlugins(app: Express): Promise<void> {
  for (const initialize of initializers) {
    await initialize(app);
  }
}
