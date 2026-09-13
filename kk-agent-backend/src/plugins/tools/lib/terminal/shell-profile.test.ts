import assert from "node:assert/strict";
import test from "node:test";
import { buildShellCommandArgs, detectTerminalShell, type ShellDetectionOptions } from "./shell-profile.js";

function detectWindows(input: {
  existing?: string[];
  outputs?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}) {
  const existing = new Set(input.existing ?? []);
  const options: ShellDetectionOptions = {
    platform: "win32",
    env: input.env ?? {},
    exists: (path) => existing.has(path),
    probe: (executable, args) => {
      const key = `${executable} ${args.join(" ")}`;
      const stdout = input.outputs?.[key];
      return { ok: stdout !== undefined, stdout: stdout ?? "" };
    },
  };
  return detectTerminalShell(options);
}

test("Windows prefers a detected Git Bash over PowerShell", () => {
  const git = "C:\\Program Files\\Git\\cmd\\git.exe";
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const result = detectWindows({
    existing: [bash],
    outputs: {
      "where.exe git.exe": git,
      [`${bash} --version`]: "GNU bash, version 5.2.37(1)-release",
      "pwsh.exe -NoLogo -NoProfile -NonInteractive -Command $PSVersionTable.PSVersion.ToString()": "7.5.2",
    },
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.profile.kind, "git-bash");
  assert.equal(result.profile.dialect, "posix");
  assert.match(result.profile.syntaxRules, /POSIX shell syntax/);
  assert.match(result.profile.pathConvention, /native Windows programs/u);
  assert.match(result.profile.pathConvention, /\/tmp are not portable/u);
});

test("Windows falls back to PowerShell 7 and then Windows PowerShell", () => {
  const core = detectWindows({
    outputs: {
      "pwsh.exe -NoLogo -NoProfile -NonInteractive -Command $PSVersionTable.PSVersion.ToString()": "7.5.2",
    },
  });
  assert.equal(core.status, "available");
  if (core.status === "available") assert.equal(core.profile.kind, "powershell-core");

  const legacy = detectWindows({
    outputs: {
      "powershell.exe -NoLogo -NoProfile -NonInteractive -Command $PSVersionTable.PSVersion.ToString()": "5.1.26100.7019",
    },
  });
  assert.equal(legacy.status, "available");
  if (legacy.status !== "available") return;
  assert.equal(legacy.profile.kind, "windows-powershell");
  assert.match(legacy.profile.syntaxRules, /Do not use && or \|\|/);
  assert.deepEqual(buildShellCommandArgs(legacy.profile, "node -v" ).slice(0, 4), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
  ]);
});

test("Terminal is unavailable when no supported Windows shell exists", () => {
  const result = detectWindows({});
  assert.deepEqual(result, {
    status: "unavailable",
    error: "No supported shell was found. Install Git Bash or PowerShell 7, or restore Windows PowerShell.",
  });
});

test("POSIX detection prefers Bash and binds POSIX command arguments", () => {
  const result = detectTerminalShell({
    platform: "linux",
    env: { SHELL: "/bin/bash" },
    exists: (path) => path === "/bin/bash",
    probe: (executable, args) => executable === "/bin/bash" && args[0] === "--version"
      ? { ok: true, stdout: "GNU bash, version 5.2.0(1)-release" }
      : { ok: false, stdout: "" },
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.profile.kind, "bash");
  assert.deepEqual(buildShellCommandArgs(result.profile, "node -v && npm -v"), [
    "--noprofile",
    "--norc",
    "-c",
    "set -o pipefail\nnode -v && npm -v",
  ]);
});
