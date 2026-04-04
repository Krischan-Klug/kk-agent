import type { McpServerConfig } from "../../../mcp/types.js";
import { getDefaultPathForScope } from "../access-paths.js";

export const DEFAULT_TERMINAL_WORKDIR = getDefaultPathForScope("user");

export const terminalDefinition: McpServerConfig = {
  id: "terminal",
  name: "Terminal",
  active: true,
  instruction:
    "Use Bash for shell commands, builds, tests, package manager tasks, git, and other command-line work. " +
    "Prefer dedicated tools like Read, Glob, Grep, Edit, and Write when they fit the task better than shell commands. " +
    "Use short, targeted commands. In plan mode, keep Bash read-only. Ask before destructive or system-changing commands.",
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
