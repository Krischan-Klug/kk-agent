import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import {
  getDefaultPathForScope,
  getTerminalElevationLabel,
  resolveAccessScope,
  resolveTerminalSystemConfig,
} from "../access-paths.js";
import {
  buildShellScript,
  buildShellCommandArgs,
  getShellScriptExtension,
  getTerminalShellProfile,
  type TerminalShellProfile,
} from "./shell-profile.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = 30000;
const MAX_BUFFER = 1024 * 1024;

type ExecutionError = Error & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: number | string;
  killed?: boolean;
  signal?: NodeJS.Signals;
};

function getWorkingDirectory(config: McpServerConfig): string {
  return resolveTerminalSystemConfig(config.systemConfig).workingDirectory ?? resolve("/");
}

function getAllowedRoot(config: McpServerConfig): string {
  return getDefaultPathForScope(resolveAccessScope(config.systemConfig?.accessScope));
}

function normalizePathForComparison(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function resolveWithinWorkingDirectory(allowedRoot: string, baseDirectory: string, target?: unknown): string {
  const candidate = typeof target === "string" && target.trim()
    ? resolve(baseDirectory, target)
    : resolve(baseDirectory);
  const resolvedRoot = resolve(allowedRoot);
  const comparableRoot = normalizePathForComparison(resolvedRoot);
  const normalizedRoot = comparableRoot.endsWith(sep) ? comparableRoot : `${comparableRoot}${sep}`;
  const normalizedCandidate = normalizePathForComparison(candidate);
  if (normalizedCandidate !== comparableRoot && !normalizedCandidate.startsWith(normalizedRoot)) {
    throw new Error(`Working directory override "${String(target ?? "")}" is outside the allowed access scope`);
  }
  return candidate;
}

function text(value: string | Buffer | undefined): string {
  return value === undefined ? "" : Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

function combineOutput(stdout?: string | Buffer, stderr?: string | Buffer): string {
  return [text(stdout).trim(), text(stderr).trim()].filter(Boolean).join("\n\n");
}

function shellMetadata(
  profile: TerminalShellProfile,
  cwd: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    shell: profile.kind,
    shellDisplayName: profile.displayName,
    shellVersion: profile.version,
    shellExecutable: profile.executable,
    cwd,
    ...fields,
  };
}

function foregroundResult(
  profile: TerminalShellProfile,
  cwd: string,
  output: string,
  exitCode: number,
  fields: Record<string, unknown> = {},
): ToolCallResult {
  return {
    content: `${output || "[no output]"}\n\n[exit code: ${exitCode}]`,
    isError: exitCode !== 0,
    metadata: shellMetadata(profile, cwd, { exitCode, ...fields }),
  };
}

function timeoutResult(profile: TerminalShellProfile, cwd: string, timeoutMs: number, output: string): ToolCallResult {
  return {
    content: `${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`,
    isError: true,
    metadata: shellMetadata(profile, cwd, {
      timedOut: true,
      interrupted: true,
      errorKind: "timeout",
    }),
  };
}

function commandEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(process.platform !== "win32" ? { LANG: process.env.LANG || "C.UTF-8", LC_ALL: process.env.LC_ALL || "C.UTF-8" } : {}),
    ...(overrides ?? {}),
  };
}

async function prepareElevatedWindowsLaunch(input: {
  profile: TerminalShellProfile;
  command: string;
  cwd: string;
  taskDir: string;
  scriptName: string;
  stdoutPath: string;
  stderrPath: string;
}): Promise<{ executable: string; args: string[] }> {
  const scriptPath = join(input.taskDir, `${input.scriptName}${getShellScriptExtension(input.profile)}`);
  await writeFile(scriptPath, buildShellScript(input.profile, input.command), "utf8");
  const scriptArgs = input.profile.dialect === "powershell"
    ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
    : [scriptPath];
  const launcher = [
    "$ErrorActionPreference = 'Stop'",
    `$arguments = ${powerShellLiteral(windowsArgumentLine(scriptArgs))}`,
    `$process = Start-Process -FilePath ${powerShellLiteral(input.profile.executable)} -ArgumentList $arguments -WorkingDirectory ${powerShellLiteral(input.cwd)} -RedirectStandardOutput ${powerShellLiteral(input.stdoutPath)} -RedirectStandardError ${powerShellLiteral(input.stderrPath)} -Verb RunAs -PassThru -Wait`,
    "exit $process.ExitCode",
  ].join("\n");
  return {
    executable: "powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(launcher)],
  };
}

async function runBackgroundCommand(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  elevated: boolean,
): Promise<ToolCallResult> {
  const taskId = randomUUID();
  const taskDir = join(cwd, ".kk-agent-shell-tasks");
  await mkdir(taskDir, { recursive: true });

  const stdoutPath = join(taskDir, `${taskId}.stdout.txt`);
  const stderrPath = join(taskDir, `${taskId}.stderr.txt`);
  const statusPath = join(taskDir, `${taskId}.status.json`);
  const startedAt = new Date().toISOString();

  await writeFile(statusPath, JSON.stringify({
    id: taskId,
    status: "running",
    command,
    shell: profile.kind,
    shellVersion: profile.version,
    startedAt,
  }, null, 2), "utf8");

  let executable = profile.executable;
  let commandArgs = buildShellCommandArgs(profile, command);
  let outputIsRedirectedByLauncher = false;
  if (elevated && process.platform === "win32") {
    const launch = await prepareElevatedWindowsLaunch({
      profile,
      command,
      cwd,
      taskDir,
      scriptName: `${taskId}.command`,
      stdoutPath,
      stderrPath,
    });
    executable = launch.executable;
    commandArgs = launch.args;
    outputIsRedirectedByLauncher = true;
  } else if (elevated) {
    executable = "sudo";
    commandArgs = ["-n", profile.executable, ...commandArgs];
  }

  const stdoutStream = outputIsRedirectedByLauncher ? undefined : createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = outputIsRedirectedByLauncher ? undefined : createWriteStream(stderrPath, { flags: "a" });
  const child = spawn(executable, commandArgs, {
    cwd,
    env,
    detached: true,
    windowsHide: true,
    stdio: outputIsRedirectedByLauncher ? "ignore" : ["ignore", "pipe", "pipe"],
  });

  if (stdoutStream) child.stdout?.pipe(stdoutStream);
  if (stderrStream) child.stderr?.pipe(stderrStream);

  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });

  const finish = async (status: "completed" | "failed", exitCode: number, error?: string) => {
    stdoutStream?.end();
    stderrStream?.end();
    await writeFile(statusPath, JSON.stringify({
      id: taskId,
      status,
      command,
      shell: profile.kind,
      shellVersion: profile.version,
      elevated,
      exitCode,
      error,
      startedAt,
      completedAt: new Date().toISOString(),
      stdoutPath,
      stderrPath,
    }, null, 2), "utf8").catch(() => undefined);
  };

  child.once("exit", (code) => void finish(code === 0 ? "completed" : "failed", code ?? 1));
  child.once("error", (error) => void finish("failed", 1, error.message));
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
    metadata: shellMetadata(profile, cwd, {
      background: true,
      elevated,
      taskId,
      stdoutPath,
      stderrPath,
      statusPath,
    }),
  };
}

function powerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteWindowsProcessArgument(value: string): string {
  return `"${value
    .replace(/(\\*)"/g, "$1$1\\\"")
    .replace(/(\\+)$/g, "$1$1")}"`;
}

function windowsArgumentLine(args: string[]): string {
  return args.map(quoteWindowsProcessArgument).join(" ");
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

async function executeElevatedWindowsCommand(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<ToolCallResult> {
  const taskDir = await mkdtemp(join(tmpdir(), "kk-agent-elevated-"));
  const stdoutPath = join(taskDir, "stdout.txt");
  const stderrPath = join(taskDir, "stderr.txt");
  const launch = await prepareElevatedWindowsLaunch({
    profile,
    command,
    cwd,
    taskDir,
    scriptName: "command",
    stdoutPath,
    stderrPath,
  });

  try {
    await execFileAsync(launch.executable, launch.args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
    });
    const output = combineOutput(
      await readFile(stdoutPath, "utf8").catch(() => ""),
      await readFile(stderrPath, "utf8").catch(() => ""),
    );
    return foregroundResult(profile, cwd, output, 0, { elevated: true });
  } catch (error) {
    const execution = error as ExecutionError;
    const output = combineOutput(
      await readFile(stdoutPath, "utf8").catch(() => text(execution.stdout)),
      await readFile(stderrPath, "utf8").catch(() => text(execution.stderr)),
    );
    if (execution.killed) return timeoutResult(profile, cwd, timeoutMs, output);
    const code = typeof execution.code === "number" ? execution.code : 1;
    return foregroundResult(profile, cwd, output || execution.message, code, {
      elevated: true,
      errorKind: "exit_code",
    });
  } finally {
    await rm(taskDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function executeElevatedUnixCommand(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<ToolCallResult> {
  try {
    const { stdout, stderr } = await execFileAsync("sudo", ["-n", profile.executable, ...buildShellCommandArgs(profile, command)], {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      env,
      encoding: "utf8",
    });
    return foregroundResult(profile, cwd, combineOutput(stdout, stderr), 0, { elevated: true });
  } catch (error) {
    const execution = error as ExecutionError;
    const output = combineOutput(execution.stdout, execution.stderr);
    if (execution.killed) return timeoutResult(profile, cwd, timeoutMs, output);
    const code = typeof execution.code === "number" ? execution.code : 1;
    return foregroundResult(profile, cwd, output || execution.message, code, {
      elevated: true,
      errorKind: "exit_code",
    });
  }
}

async function executeForegroundCommand(
  profile: TerminalShellProfile,
  command: string,
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<ToolCallResult> {
  try {
    const { stdout, stderr } = await execFileAsync(profile.executable, buildShellCommandArgs(profile, command), {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      env,
      encoding: "utf8",
    });
    return foregroundResult(profile, cwd, combineOutput(stdout, stderr), 0);
  } catch (error) {
    const execution = error as ExecutionError;
    const output = combineOutput(execution.stdout, execution.stderr);
    if (execution.killed) return timeoutResult(profile, cwd, timeoutMs, output);
    const code = typeof execution.code === "number" ? execution.code : 1;
    return foregroundResult(profile, cwd, output || execution.message, code, {
      interrupted: Boolean(execution.signal),
      errorKind: typeof execution.code === "string" ? "spawn" : "exit_code",
    });
  }
}

export async function executeTerminalTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "Terminal") return null;

  const profile = getTerminalShellProfile();
  if (!profile) return { content: "Terminal is unavailable because no supported shell was detected.", isError: true };

  const workingDirectory = getWorkingDirectory(config);
  const allowedRoot = getAllowedRoot(config);
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");

  const cwd = resolveWithinWorkingDirectory(allowedRoot, workingDirectory, args.cwd);
  if (!existsSync(cwd)) throw new Error(`Working directory "${cwd}" does not exist`);

  const timeoutMs = typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
    ? args.timeoutMs
    : DEFAULT_TIMEOUT;
  const envOverrides = typeof args.env === "object" && args.env !== null
    ? Object.fromEntries(Object.entries(args.env).map(([key, value]) => [key, String(value)]))
    : undefined;
  const env = commandEnvironment(envOverrides);

  const elevated = getTerminalElevationLabel(config.systemConfig?.accessScope) === "elevated";

  if (args.run_in_background === true) {
    return runBackgroundCommand(profile, command, cwd, env, elevated);
  }

  if (elevated) {
    return process.platform === "win32"
      ? executeElevatedWindowsCommand(profile, command, cwd, timeoutMs)
      : executeElevatedUnixCommand(profile, command, cwd, timeoutMs, env);
  }

  return executeForegroundCommand(profile, command, cwd, timeoutMs, env);
}
