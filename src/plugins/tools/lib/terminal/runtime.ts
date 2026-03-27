import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";

const execAsync = promisify(exec);
const COMMAND_OUTPUT_LIMIT = 12000;
const DEFAULT_TIMEOUT = 30000;

/** Truncate from the beginning, keeping the tail (errors/results appear at end). */
function clamp(text: string, max = COMMAND_OUTPUT_LIMIT): string {
  if (text.length <= max) return text;
  return `[truncated — showing last ${max} chars]\n\n${text.slice(-max)}`;
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

  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : DEFAULT_TIMEOUT;

  const env =
    typeof args.env === "object" && args.env !== null
      ? { ...process.env, ...(args.env as Record<string, string>) }
      : undefined;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env,
    });

    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
    return { content: clamp(`${output || "[no output]"}\n\n[exit code: 0]`), isError: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };

    if (e.killed) {
      const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
      return { content: clamp(`${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`), isError: true };
    }

    const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
    const code = e.code ?? 1;
    return { content: clamp(`${output || e.message || "[no output]"}\n\n[exit code: ${code}]`), isError: code !== 0 };
  }
}
