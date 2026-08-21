import type { McpToolDefinition } from "../../../mcp/types.js";
import type { TerminalShellProfile } from "./shell-profile.js";

export function buildTerminalTools(profile: TerminalShellProfile): McpToolDefinition[] {
  return [{
    name: "Terminal",
    description: [
      `Run a command on the host with ${profile.displayName} ${profile.version}.`,
      profile.syntaxRules,
      "Use it for tests, builds, git, package managers, scripts, and other real terminal work. Prefer dedicated file tools when available.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: `Command written for ${profile.displayName}.` },
        cwd: { type: "string", description: "Optional working directory override." },
        timeoutMs: { type: "number", description: "Timeout in milliseconds (default: 30000)." },
        run_in_background: {
          type: "boolean",
          description: "Run the command in the background and write output to files inside the working directory.",
        },
        env: { type: "object", description: "Optional environment variables.", additionalProperties: { type: "string" } },
      },
      required: ["command"],
    },
    mcpId: "terminal",
  }];
}
