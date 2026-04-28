import type { ModulePlugin } from "../types.js";

const LoopPlugin: ModulePlugin = {
  name: "loop",
  version: "0.1.0",
  description: "Agent loop — turns an LLM into an autonomous agent by orchestrating tool calls.",
  deps: [{ name: "provider" }, { name: "mcp" }, { name: "tools" }, { name: "agent" }, { name: "systemprompt" }],
  async init() {},
};

export default LoopPlugin;

export * from "./types.js";
