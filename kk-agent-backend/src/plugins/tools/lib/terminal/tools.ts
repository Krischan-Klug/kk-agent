import type { InternalToolDescriptor } from "../../types.js";

export const TERMINAL_TOOLS: InternalToolDescriptor[] = [{
    name: "Terminal",
    description: "Run a host command, inspect or stop a managed background task, or page/search retained output from a large foreground command.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["run", "status", "stop", "output"],
          description: "Operation to perform. Defaults to run.",
        },
        command: { type: "string", description: "Command to run. Required for action=run." },
        taskId: { type: "string", description: "Managed background task id. Required for action=status or action=stop." },
        outputId: { type: "string", description: "Retained foreground-output id. Required for action=output." },
        stream: { type: "string", enum: ["stdout", "stderr"], description: "Output stream to read (default stdout)." },
        offsetBytes: { type: "number", description: "Byte offset for action=output (default 0)." },
        limitBytes: { type: "number", description: "Maximum bytes for action=output (default 65536, maximum 262144)." },
        pattern: { type: "string", description: "Optional case-insensitive text used to select matching output lines." },
        cwd: { type: "string", description: "Optional working directory override." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds. Foreground commands default to 30000; background commands have no timeout unless provided." },
        run_in_background: {
          type: "boolean",
          description: "Run the command in the background and retain output under the owning session.",
        },
        env: { type: "object", description: "Optional environment variables.", additionalProperties: { type: "string" } },
      },
    },
  }];
