import type { McpToolDefinition } from "../../../mcp/types.js";
import type { TerminalShellProfile } from "./shell-profile.js";

export function buildTerminalTools(_profile: TerminalShellProfile): McpToolDefinition[] {
  return [{
    name: "Terminal",
    description: "Run a command on the host.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to run." },
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
