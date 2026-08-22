import { existsSync } from "node:fs";
import { basename, win32 as pathWin32 } from "node:path";
import { spawnSync } from "node:child_process";

export type TerminalShellDialect = "posix" | "powershell";
type TerminalShellKind = "git-bash" | "bash" | "zsh" | "sh" | "powershell-core" | "windows-powershell";

export interface TerminalShellProfile {
  kind: TerminalShellKind;
  dialect: TerminalShellDialect;
  displayName: string;
  executable: string;
  version: string;
  pathConvention: string;
  syntaxRules: string;
}

export type TerminalShellResolution =
  | { status: "available"; profile: TerminalShellProfile }
  | { status: "unavailable"; error: string };

type ProbeResult = { ok: boolean; stdout: string };
type ShellProbe = (executable: string, args: string[]) => ProbeResult;

export interface ShellDetectionOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  probe?: ShellProbe;
}

function defaultProbe(executable: string, args: string[]): ProbeResult {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout ?? "").trim(),
  };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? "unknown";
}

function bashVersion(value: string): string {
  return /version\s+([^\s(]+)/i.exec(value)?.[1] ?? (firstLine(value) || "unknown");
}

function posixProfile(
  kind: Extract<TerminalShellKind, "git-bash" | "bash" | "zsh" | "sh">,
  executable: string,
  versionOutput: string,
): TerminalShellProfile {
  const displayName = kind === "git-bash"
    ? "Git Bash"
    : kind === "zsh"
      ? "Zsh"
      : kind === "sh"
        ? "POSIX sh"
        : "Bash";
  return {
    kind,
    dialect: "posix",
    displayName,
    executable,
    version: bashVersion(versionOutput),
    pathConvention: kind === "git-bash"
      ? "Use POSIX paths and forward slashes. Windows drives are available as /c/..., and the null device is /dev/null."
      : "Use POSIX paths with forward slashes and /dev/null as the null device.",
    syntaxRules: "Use POSIX shell syntax, including &&, ||, pipes, redirects, and shell quoting. Do not use PowerShell or cmd.exe syntax.",
  };
}

function powershellProfile(
  kind: Extract<TerminalShellKind, "powershell-core" | "windows-powershell">,
  executable: string,
  versionOutput: string,
): TerminalShellProfile {
  const core = kind === "powershell-core";
  return {
    kind,
    dialect: "powershell",
    displayName: core ? "PowerShell 7" : "Windows PowerShell",
    executable,
    version: firstLine(versionOutput) || "unknown",
    pathConvention: "Use Windows paths and PowerShell path handling. Use $null as the null device.",
    syntaxRules: core
      ? "Use PowerShell syntax and cmdlets. PowerShell 7 supports && and ||, but do not assume POSIX utilities or Bash quoting."
      : "Use Windows PowerShell 5.1-compatible syntax and cmdlets. Do not use && or ||; use separate statements and explicit PowerShell condition handling.",
  };
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function gitBashCandidates(env: NodeJS.ProcessEnv, probe: ShellProbe): string[] {
  const whereGit = probe("where.exe", ["git.exe"]);
  const gitPaths = whereGit.ok ? whereGit.stdout.split(/\r?\n/).filter(Boolean) : [];
  const derived = gitPaths.flatMap((gitPath) => {
    const gitDir = pathWin32.dirname(gitPath.trim());
    return [
      pathWin32.join(gitDir, "bash.exe"),
      pathWin32.resolve(gitDir, "..", "bin", "bash.exe"),
      pathWin32.resolve(gitDir, "..", "..", "bin", "bash.exe"),
    ];
  });
  return unique([
    env.KK_AGENT_GIT_BASH_PATH,
    env.CLAUDE_CODE_GIT_BASH_PATH,
    ...derived,
    env.ProgramFiles ? pathWin32.join(env.ProgramFiles, "Git", "bin", "bash.exe") : undefined,
    env["ProgramFiles(x86)"] ? pathWin32.join(env["ProgramFiles(x86)"], "Git", "bin", "bash.exe") : undefined,
    env.LOCALAPPDATA ? pathWin32.join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe") : undefined,
  ]);
}

function detectWindowsShell(env: NodeJS.ProcessEnv, exists: (path: string) => boolean, probe: ShellProbe): TerminalShellResolution {
  for (const candidate of gitBashCandidates(env, probe)) {
    if (!exists(candidate)) continue;
    const version = probe(candidate, ["--version"]);
    if (version.ok) return { status: "available", profile: posixProfile("git-bash", pathWin32.resolve(candidate), version.stdout) };
  }

  const pwsh = probe("pwsh.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
  if (pwsh.ok) return { status: "available", profile: powershellProfile("powershell-core", "pwsh.exe", pwsh.stdout) };

  const windowsPowerShell = probe("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
  if (windowsPowerShell.ok) {
    return { status: "available", profile: powershellProfile("windows-powershell", "powershell.exe", windowsPowerShell.stdout) };
  }

  return {
    status: "unavailable",
    error: "No supported shell was found. Install Git Bash or PowerShell 7, or restore Windows PowerShell.",
  };
}

function posixCandidates(env: NodeJS.ProcessEnv): Array<{ kind: "bash" | "zsh" | "sh"; executable: string }> {
  const configuredShell = env.SHELL?.trim();
  const configuredName = configuredShell ? basename(configuredShell) : "";
  return [
    ...(configuredName === "bash" ? [{ kind: "bash" as const, executable: configuredShell! }] : []),
    { kind: "bash", executable: "/bin/bash" },
    { kind: "bash", executable: "/usr/bin/bash" },
    { kind: "bash", executable: "bash" },
    ...(configuredName === "zsh" ? [{ kind: "zsh" as const, executable: configuredShell! }] : []),
    { kind: "zsh", executable: "/bin/zsh" },
    { kind: "zsh", executable: "zsh" },
    ...(configuredName === "sh" ? [{ kind: "sh" as const, executable: configuredShell! }] : []),
    { kind: "sh", executable: "/bin/sh" },
    { kind: "sh", executable: "sh" },
  ];
}

function detectPosixShell(env: NodeJS.ProcessEnv, exists: (path: string) => boolean, probe: ShellProbe): TerminalShellResolution {
  const seen = new Set<string>();
  for (const candidate of posixCandidates(env)) {
    if (seen.has(candidate.executable)) continue;
    seen.add(candidate.executable);
    if (candidate.executable.includes("/") && !exists(candidate.executable)) continue;
    const versionArgs = candidate.kind === "sh" ? ["-c", "echo POSIX-sh"] : ["--version"];
    const version = probe(candidate.executable, versionArgs);
    if (version.ok) {
      return { status: "available", profile: posixProfile(candidate.kind, candidate.executable, version.stdout) };
    }
  }
  return { status: "unavailable", error: "No supported Bash, Zsh, or POSIX sh executable was found." };
}

export function detectTerminalShell(options: ShellDetectionOptions = {}): TerminalShellResolution {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const probe = options.probe ?? defaultProbe;
  return platform === "win32"
    ? detectWindowsShell(env, exists, probe)
    : detectPosixShell(env, exists, probe);
}

let cachedResolution: TerminalShellResolution | undefined;

export function initializeTerminalShell(): TerminalShellResolution {
  cachedResolution = detectTerminalShell();
  return cachedResolution;
}

export function getTerminalShellResolution(): TerminalShellResolution {
  return cachedResolution ?? initializeTerminalShell();
}

export function getTerminalShellProfile(): TerminalShellProfile | undefined {
  const resolution = getTerminalShellResolution();
  return resolution.status === "available" ? resolution.profile : undefined;
}

function powershellUtf8Preamble(): string {
  return "$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);";
}

export function buildShellCommandArgs(profile: TerminalShellProfile, command: string): string[] {
  if (profile.dialect === "powershell") {
    return ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `${powershellUtf8Preamble()}\n${command}`];
  }
  return ["-lc", command];
}
