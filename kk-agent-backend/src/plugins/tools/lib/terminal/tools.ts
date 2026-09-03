import type { InternalToolDescriptor } from "../../types.js";

export const TERMINAL_TOOLS: InternalToolDescriptor[] = [{
    name: "Terminal",
    description: "Run a host command or inspect/stop a managed background terminal task.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["run", "status", "stop"],
          description: "Operation to perform. Defaults to run.",
        },
        command: { type: "string", description: "Command to run. Required for action=run." },
        taskId: { type: "string", description: "Managed background task id. Required for action=status or action=stop." },
        cwd: { type: "string", description: "Optional working directory override." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds. Foreground commands default to 30000; background commands have no timeout unless provided." },
        run_in_background: {
          type: "boolean",
          description: "Run the command in the background and write output to files inside the working directory.",
        },
        env: { type: "object", description: "Optional environment variables.", additionalProperties: { type: "string" } },
      },
    },
  }];
