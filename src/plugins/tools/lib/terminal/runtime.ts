import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const execAsync = promisify(exec);
const COMMAND_OUTPUT_LIMIT = 12000;
const DEFAULT_TIMEOUT = 30000;
const READ_ONLY_COMMAND_PREFIXES = [
  "pwd",
  "ls",
  "dir",
  "type",
  "cat",
  "rg",
  "findstr",
  "where",
  "where.exe",
  "git status",
  "git diff",
  "git show",
  "git log",
  "git branch",
  "git rev-parse",
  "git ls-files",
  "git grep",
  "get-childitem",
  "get-content",
  "select-string",
  "test-path",
  "get-item",
  "resolve-path",
  "node --version",
  "npm -v",
  "pnpm -v",
  "yarn -v",
  "python --version",
  "python -v",
];
const READ_ONLY_BLOCK_PATTERNS = [
  /&&|\|\||;|>>?|<</,
  /\b(remove-item|set-content|add-content|out-file|copy-item|move-item|rename-item|new-item|clear-content|set-item|set-location)\b/,
  /\b(rm|del|erase|copy|cp|move|mv|ren|mkdir|md|rmdir|rd|touch|echo|sed|awk)\b/,
  /\bgit\s+(add|apply|commit|merge|rebase|push|pull|checkout|switch|restore|reset|clean|stash|tag)\b/,
  /\bnpm\s+(install|update|uninstall|run|exec)\b/,
  /\bpnpm\s+(add|install|update|remove|run|exec)\b/,
  /\byarn\s+(add|install|remove|up|run|dlx)\b/,
  /\b(python\s+-m\s+pip|pip\s+(install|uninstall)|uv\s+(pip|sync|run))\b/,
];

function clamp(text: string, max = COMMAND_OUTPUT_LIMIT): string {
  if (text.length <= max) return text;
  return `[truncated - showing last ${max} chars]\n\n${text.slice(-max)}`;
}

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

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function validateReadOnlyCommand(command: string): void {
  const normalized = normalizeCommand(command);
  const lower = normalized.toLowerCase();
  if (!lower) throw new Error("command is required");
  if (READ_ONLY_BLOCK_PATTERNS.some((pattern) => pattern.test(lower))) {
    throw new Error("run_command_readonly erlaubt nur strikt nicht-mutierende Diagnose- und Lesebefehle");
  }
  const allowed = READ_ONLY_COMMAND_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `));
  if (!allowed) {
    throw new Error("run_command_readonly akzeptiert nur vordefinierte Read-only-Befehle fuer Analyse und Inspektion");
  }
}

function powershellSingleQuote(value: string): string {
  return value.replace(/'/g, "''");
}

async function executeElevatedWindowsCommand(command: string, cwd: string, timeoutMs: number): Promise<ToolCallResult> {
  const workDir = await mkdtemp(join(tmpdir(), "kk-agent-terminal-"));
  const outputPath = join(workDir, "stdout.txt");
  const errorPath = join(workDir, "stderr.txt");
  const exitCodePath = join(workDir, "exit-code.txt");
  const scriptPath = join(workDir, "elevated.ps1");

  const script = [
    "$ErrorActionPreference = 'Continue'",
    `Set-Location -LiteralPath '${powershellSingleQuote(cwd)}'`,
    `& { ${command} } 1> '${powershellSingleQuote(outputPath)}' 2> '${powershellSingleQuote(errorPath)}'`,
    "$code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }",
    `Set-Content -LiteralPath '${powershellSingleQuote(exitCodePath)}' -Value $code`,
    "exit $code",
  ].join("\r\n");

  await writeFile(scriptPath, script, "utf-8");

  const launcher = [
    `$scriptPath = '${powershellSingleQuote(scriptPath)}'`,
    "try {",
    "  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $scriptPath) -Wait",
    "} catch {",
    "  Write-Error $_.Exception.Message",
    "  exit 1",
    "}",
  ].join("; ");

  try {
    await execAsync(`powershell.exe -NoProfile -Command "${launcher.replace(/"/g, '\\"')}"`, {
      cwd,
      timeout: timeoutMs,
      windowsHide: false,
      maxBuffer: 1024 * 1024,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout?.trim(), e.stderr?.trim(), e.message].filter(Boolean).join("\n\n");
    await rm(workDir, { recursive: true, force: true });
    return {
      content: clamp(`${output || "Erhoehte Terminal-Ausfuehrung konnte nicht gestartet werden."}\n\n[exit code: 1]`),
      isError: true,
    };
  }

  const [stdout, stderr, exitCodeRaw] = await Promise.all([
    readFile(outputPath, "utf-8").catch(() => ""),
    readFile(errorPath, "utf-8").catch(() => ""),
    readFile(exitCodePath, "utf-8").catch(() => "1"),
  ]);
  await rm(workDir, { recursive: true, force: true });

  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
  const code = Number.parseInt(exitCodeRaw.trim(), 10);
  const exitCode = Number.isNaN(code) ? 1 : code;
  return {
    content: clamp(`${output || "[no output]"}\n\n[exit code: ${exitCode}]`),
    isError: exitCode !== 0,
  };
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
    return { content: clamp(`${output || "[no output]"}\n\n[exit code: 0]`), isError: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };
    if (e.killed) {
      const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
      return { content: clamp(`${output || "[no output]"}\n\n[timed out after ${timeoutMs}ms]`), isError: true };
    }

    const output = [e.stdout?.trim(), e.stderr?.trim()].filter(Boolean).join("\n\n");
    const code = e.code ?? 1;
    return { content: clamp(`${output || e.message || "[no output]"}\n\n[exit code: ${code}]`), isError: true };
  }
}

export async function executeTerminalTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "run_command" && toolName !== "run_command_readonly") return null;

  const workingDirectory = getWorkingDirectory(config);
  const allowedRoot = getAllowedRoot(config);
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");
  if (toolName === "run_command_readonly") validateReadOnlyCommand(command);

  const cwd = resolveWithinWorkingDirectory(allowedRoot, workingDirectory, args.cwd);
  if (!existsSync(cwd)) {
    throw new Error(`Working directory "${cwd}" does not exist`);
  }

  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : DEFAULT_TIMEOUT;
  const env =
    typeof args.env === "object" && args.env !== null
      ? { ...process.env, ...(args.env as Record<string, string>) }
      : undefined;

  if (toolName === "run_command" && getTerminalElevationLabel(config.systemConfig?.accessScope) === "elevated") {
    if (process.platform === "win32") {
      return executeElevatedWindowsCommand(command, cwd, timeoutMs);
    }
    return executeElevatedUnixCommand(command, cwd, timeoutMs, env);
  }

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
