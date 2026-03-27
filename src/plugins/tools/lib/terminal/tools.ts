import type { McpToolDefinition } from "../../../mcp/types.js";

export const terminalTools: McpToolDefinition[] = [
  {
    name: "run_command",
    description:
      "Run a shell command and return stdout, stderr, and exit code. Long output keeps the tail (most recent output). Use for builds, tests, git, package manager, and other terminal tasks.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." },
        cwd: {
          type: "string",
          description: "Optional working directory override. Must stay inside the allowed root.",
        },
        timeoutMs: { type: "number", description: "Timeout in milliseconds. Defaults to 30000." },
        env: {
          type: "object",
          description: "Optional environment variables to set for this command. Merged with the default environment.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["command"],
    },
    mcpId: "terminal",
  },
];
