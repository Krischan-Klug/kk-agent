import type { McpToolDefinition } from "../../../mcp/types.js";

export const terminalTools: McpToolDefinition[] = [
  {
    name: "run_command_readonly",
    description: "Run a strictly read-only shell command for inspection or diagnostics. Rejects mutating commands.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Read-only shell command to execute." },
        cwd: { type: "string", description: "Working directory override." },
        timeoutMs: { type: "number", description: "Timeout in ms (default: 30000)." },
      },
      required: ["command"],
    },
    mcpId: "terminal",
  },
  {
    name: "run_command",
    description: "Run a shell command. Returns stdout, stderr, exit code. Long output keeps the tail.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
        cwd: { type: "string", description: "Working directory override." },
        timeoutMs: { type: "number", description: "Timeout in ms (default: 30000)." },
        env: { type: "object", description: "Extra env vars for this command.", additionalProperties: { type: "string" } },
      },
      required: ["command"],
    },
    mcpId: "terminal",
  },
];
