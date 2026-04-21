import type { ModulePlugin } from "../types.js";

export const LoopPlugin: ModulePlugin = {
  name: "loop",
  version: "0.1.0",
  description: "Agent loop — turns an LLM into an autonomous agent by orchestrating tool calls.",
  deps: [{ name: "provider" }, { name: "mcp" }, { name: "tools" }, { name: "agent" }, { name: "systemprompt" }],
  async init() {},
};

export default LoopPlugin;

export { runAgentLoop } from "./lib/agent-loop.js";
export * from "./types.js";
