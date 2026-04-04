import type { McpToolDefinition } from "../../../mcp/types.js";

export const terminalTools: McpToolDefinition[] = [
  {
    name: "Bash",
    description: "Run a shell command on the host. Prefer dedicated tools for reading, globbing, and grep when available.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
        description: {
          type: "string",
          description: "Short active-voice description of what the command does.",
        },
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
  },
];
