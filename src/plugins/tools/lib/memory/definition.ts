import type { McpServerConfig } from "../../../mcp/types.js";

// Base capability guidance only. Mode-specific workflow rules live in defaults.
export const memoryDefinition: McpServerConfig = {
  id: "memory",
  name: "Memory",
  active: true,
  instruction:
    "Use remember_facts sparingly for short session facts or durable user preferences that are likely to matter again later. " +
    "Prefer concise factual memory over summaries. " +
    "Do not store transient tool output, large notes, or scratchpad content as memory.",
  emoji: "🧠",
  source: "system",
  systemKey: "memory",
  systemConfig: {},
  transport: "stdio",
  server: { command: "internal", args: [] },
};
