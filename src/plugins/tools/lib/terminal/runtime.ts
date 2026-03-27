import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const execAsync = promisify(exec);
const COMMAND_OUTPUT_LIMIT = 12000;

function clamp(text: string, max = COMMAND_OUTPUT_LIMIT): string {
  return text.length > max ? `${text.slice(0, max)}\n\n[truncated]` : text;
}

function getWorkingDirectory(config: McpServerConfig): string {
  return resolve(config.systemConfig?.workingDirectory ?? homedir());
}

function resolveWithinWorkingDirectory(baseDirectory: string, target?: unknown): string {
  const candidate =
    typeof target === "string" && target.trim()
      ? resolve(baseDirectory, target)
      : baseDirectory;
  const rel = relative(baseDirectory, candidate);
  if (rel.startsWith("..") || rel.includes("..\\") || rel.includes("../")) {
    throw new Error(`Working directory override "${String(target ?? "")}" is outside the allowed working directory`);
  }
  return candidate;
}

export async function executeTerminalTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "run_command") return null;

  const workingDirectory = getWorkingDirectory(config);
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");

  const cwd = resolveWithinWorkingDirectory(workingDirectory, args.cwd);
  if (!existsSync(cwd)) {
    throw new Error(`Working directory "${cwd}" does not exist`);
  }

  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 20000;
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
  return { content: clamp(output || "[no output]"), isError: false };
}
