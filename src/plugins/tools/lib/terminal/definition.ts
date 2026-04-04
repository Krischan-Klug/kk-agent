import type { McpServerConfig } from "../../../mcp/types.js";
import { getDefaultPathForScope } from "../access-paths.js";

export const DEFAULT_TERMINAL_WORKDIR = getDefaultPathForScope("user");

export const terminalDefinition: McpServerConfig = {
  id: "terminal",
  name: "Terminal",
  active: true,
  instruction:
    "Run terminal commands on the host in the configured working directory by default. " +
    "Use this for inspection, builds, tests, package manager commands, git, and other shell-based tasks. " +
    "Prefer short, targeted commands that return exactly the information you need. " +
    "Ask before dangerous, destructive, or system-changing commands.",
  emoji: "🖳",
  source: "system",
  systemKey: "terminal",
  systemConfig: {
    accessScope: "user",
    workingDirectory: DEFAULT_TERMINAL_WORKDIR,
    resultPolicy: { previewThresholdChars: 12000, previewChars: 2200 },
  },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
