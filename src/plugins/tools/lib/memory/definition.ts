import type { McpServerConfig } from "../../../mcp/types.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const memoryDefinition: McpServerConfig = {
  id: "memory",
  name: "Memory",
  active: true,
  instruction:
    "Use remember_facts to store short session facts or durable user preferences. " +
    "Only store information that is likely to matter again later. " +
    "Prefer concise factual memory over long summaries.",
  emoji: "🧠",
  source: "system",
  systemKey: "memory",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
