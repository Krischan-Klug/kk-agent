import type { McpToolDefinition } from "../../../mcp/types.js";

export const terminalTools: McpToolDefinition[] = [
  {
    name: "run_command",
    description: "Run a shell command for inspection, build, test, git, package manager, or other terminal tasks. Returns stdout and stderr as text.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." },
        cwd: { type: "string", description: "Optional working directory override. Must stay inside the allowed filesystem root when applicable." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds. Defaults to 20000." },
      },
      required: ["command"],
    },
    mcpId: "terminal",
  },
];
