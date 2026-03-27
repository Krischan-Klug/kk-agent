import { homedir } from "node:os";
import type { McpServerConfig } from "../../../mcp/types.js";

export const DEFAULT_TERMINAL_WORKDIR = homedir();

export const terminalDefinition: McpServerConfig = {
  id: "terminal",
  name: "Terminal",
  active: true,
  instruction:
    [
      "Run terminal commands on the host in the configured working directory by default.",
      "Use this for inspection, builds, tests, package manager commands, git, and other shell-based tasks.",
      "Prefer short, targeted commands that return exactly the information you need.",
      "Ask before dangerous, destructive, or system-changing commands.",
    ].join(" "),
  emoji: "🖳",
  source: "system",
  systemKey: "terminal",
  systemConfig: { workingDirectory: DEFAULT_TERMINAL_WORKDIR },
  transport: "stdio",
  server: { command: "internal", args: [] },
};
