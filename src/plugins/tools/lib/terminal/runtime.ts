import { exec, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import {
  getDefaultPathForScope,
  getTerminalElevationLabel,
  resolveAccessScope,
  resolveTerminalSystemConfig,
} from "../access-paths.js";
import { isReadOnlyShellCommand } from "./command-policy.js";

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT = 30000;

function getWorkingDirectory(config: McpServerConfig): string {
  return resolveTerminalSystemConfig(config.systemConfig).workingDirectory ?? resolve("/");
}

function getAllowedRoot(config: McpServerConfig): string {
  return getDefaultPathForScope(resolveAccessScope(config.systemConfig?.accessScope));
}

function resolveWithinWorkingDirectory(allowedRoot: string, baseDirectory: string, target?: unknown): string {
  const candidate =
    typeof target === "string" && target.trim()
      ? resolve(baseDirectory, target)
      : baseDirectory;
  const resolvedRoot = resolve(allowedRoot);
  const normalizedRoot = resolvedRoot.toLowerCase().endsWith(sep)
    ? resolvedRoot.toLowerCase()
    : `${resolvedRoot.toLowerCase()}${sep}`;
  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate !== resolvedRoot.toLowerCase() && !normalizedCandidate.startsWith(normalizedRoot)) {
    throw new Error(`Working directory override "${String(target ?? "")}" is outside the allowed access scope`);
  }
  return candidate;
}

function powershellSingleQuote(value: string): string {
  return value.replace(/'/g, "''");
}

async function runBackgroundCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
): Promise<ToolCallResult> {
  const taskId = randomUUID();
  const taskDir = join(cwd, ".kk-agent-shell-tasks");
  await mkdir(taskDir, { recursive: true });

  const stdoutPath = join(taskDir, `${taskId}.stdout.txt`);
  const stderrPath = join(taskDir, `${taskId}.stderr.txt`);
  const statusPath = join(taskDir, `${taskId}.status.json`);

  await writeFile(
    statusPath,
    JSON.stringify({ id: taskId, status: "running", command, startedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );

  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });

  const child =
    process.platform === "win32"
      ? spawn("powershell.exe", ["-NoProfile", "-Command", command], {
          cwd,
          env,
          detached: true,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("sh", ["-lc", command], {
          cwd,
          env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);
  child.on("exit", async (code) => {
    try {
      await writeFile(
        statusPath,
        JSON.stringify(
          {
            id: taskId,
            status: "completed",
            command,
            exitCode: code ?? 0,
            completedAt: new Date().toISOString(),
            stdoutPath,
            stderrPath,
          },
          null,
          2,
        ),
        "utf-8",
      );
    } catch {
      // ignore background status write failures
    }
  });
  child.unref();

  return {
    content: [
      `Background command started with id ${taskId}.`,
      `stdout: ${stdoutPath}`,
      `stderr: ${stderrPath}`,
      `status: ${statusPath}`,
      "Use Read to inspect the output files later if needed.",
    ].join("\n"),
    isError: false,
  };
}

async function executeElevatedWindowsCommand(command: string, cwd: string, timeoutMs: number): Promise<ToolCallResult> {
  const launcher = `Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-Command',${JSON.stringify(command)}) -Wait`;
  try {
    await execAsync(`powershell.exe -NoProfile -Command "${launcher.replace(/"/g, '\\"')}"`, {
      cwd,
      timeout: timeoutMs,
      windowsHide: false,
      maxBuffer: 1024 * 1024,
    });
    return { content: "[exit code: 0]", isError: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout?.trim(), e.stderr?.trim(), e.message].filter(Boolean).join("\n\n");
    return { content: `${output || "Elevated shell execution failed."}\n\n[exit code: 1]`, isError: true };
  }
}

async function executeElevatedUnixCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<ToolCallResult> {
  try {
    const { stdout, stderr } = await execAsync(`sudo -n sh -lc ${JSON.stringify(command)}`, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env,
    });
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
    return { content: `${output || "[no output]"}\n\n[exit code: 0]`, isError: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };
    if (e.killed) {
      const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
      return { content: `${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`, isError: true };
    }
    const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
    const code = e.code ?? 1;
    return { content: `${output || e.message || "[no output]"}\n\n[exit code: ${code}]`, isError: true };
  }
}

export async function executeTerminalTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "Bash") return null;

  const workingDirectory = getWorkingDirectory(config);
  const allowedRoot = getAllowedRoot(config);
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");

  const cwd = resolveWithinWorkingDirectory(allowedRoot, workingDirectory, args.cwd);
  if (!existsSync(cwd)) throw new Error(`Working directory "${cwd}" does not exist`);

  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : DEFAULT_TIMEOUT;
  const env =
    typeof args.env === "object" && args.env !== null
      ? { ...process.env, ...(args.env as Record<string, string>) }
      : undefined;

  if (args.run_in_background === true) {
    return runBackgroundCommand(command, cwd, env);
  }

  if (getTerminalElevationLabel(config.systemConfig?.accessScope) === "elevated" && !isReadOnlyShellCommand(command)) {
    if (process.platform === "win32") {
      return executeElevatedWindowsCommand(command, cwd, timeoutMs);
    }
    return executeElevatedUnixCommand(command, cwd, timeoutMs, env);
  }

  try {
    const execution =
      process.platform === "win32"
        ? execAsync(`powershell.exe -NoProfile -Command ${JSON.stringify(command)}`, {
            cwd,
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env,
          })
        : execAsync(command, {
            cwd,
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env,
          });
    const { stdout, stderr } = await execution;

    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
    return { content: `${output || "[no output]"}\n\n[exit code: 0]`, isError: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };
    if (e.killed) {
      const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
      return { content: `${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`, isError: true };
    }

    const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
    if (!output && typeof e.message === "string") {
      return { content: `${e.message}\n\n[exit code: ${e.code ?? 1}]`, isError: true };
    }
    return { content: `${output || "[no output]"}\n\n[exit code: ${e.code ?? 1}]`, isError: true };
  }
}
