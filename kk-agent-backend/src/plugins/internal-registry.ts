import type { ModulePlugin } from "./types.js";
import core from "./core/index.js";
import agent from "./agent/index.js";
import loop from "./loop/index.js";
import systemprompt from "./systemprompt/index.js";
import tools from "./tools/index.js";
import mcp from "./mcp/index.js";
import skills from "./skills/index.js";
import provider from "./provider/index.js";
import session from "./session/index.js";

interface InternalPluginEntry {
  directory: string;
  plugin: ModulePlugin;
}

export const internalPluginEntries: InternalPluginEntry[] = [
  { directory: "core", plugin: core },
  { directory: "agent", plugin: agent },
  { directory: "loop", plugin: loop },
  { directory: "systemprompt", plugin: systemprompt },
  { directory: "tools", plugin: tools },
  { directory: "mcp", plugin: mcp },
  { directory: "skills", plugin: skills },
  { directory: "provider", plugin: provider },
  { directory: "session", plugin: session },
];
