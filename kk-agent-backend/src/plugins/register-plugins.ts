import type { Express } from "express";
import initTools from "./tools/tools-plugin.js";
import initMcp from "./mcp/mcp-plugin.js";
import initSkills from "./skills/skills-plugin.js";
import initProvider from "./provider/provider-plugin.js";
import initAgent from "./agent/agent-plugin.js";
import initSession from "./session/session-plugin.js";
import initSecurity from "./security/security-plugin.js";

const initializers = [initSecurity, initTools, initMcp, initSkills, initProvider, initAgent, initSession];

export default async function initPlugins(app: Express): Promise<void> {
  for (const initialize of initializers) {
    await initialize(app);
  }
}
