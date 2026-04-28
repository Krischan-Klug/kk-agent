import type { McpServerConfig } from "../../../mcp/types.js";
import { getDefaultPathForScope } from "../access-paths.js";

const DEFAULT_TERMINAL_WORKDIR = getDefaultPathForScope("user");

export const terminalDefinition: McpServerConfig = {
  id: "terminal",
  name: "Terminal",
  active: true,
  instruction:
    "Use Bash for shell commands, builds, tests, package manager work, git, and other real terminal operations. " +
    "Prefer dedicated tools like Read, Edit, Write, Glob, and Grep when they fit the task better than a shell command. " +
    "Use short, targeted commands. In plan mode, keep Bash read-only. Ask before destructive, irreversible, or externally visible commands.",
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
