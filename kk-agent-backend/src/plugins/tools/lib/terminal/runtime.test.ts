import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { McpServerConfig } from "../../../mcp/types.js";
import { terminalDefinition } from "./definition.js";
import { executeTerminalTool } from "./runtime.js";
import { getTerminalShellResolution, initializeTerminalShell } from "./shell-profile.js";
import { runWithSessionId } from "../user-interaction/interaction-store.js";
import { buildRuntimeContext } from "../../../session/lib/runtime-context.js";

const execFileAsync = promisify(execFile);

async function windowsSleepPids(): Promise<number[]> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "@((Get-CimInstance Win32_Process -Filter \"Name='sleep.exe'\").ProcessId) | ConvertTo-Json -Compress",
  ], { encoding: "utf8" });
  const value: unknown = JSON.parse(stdout.trim() || "[]");
  return (Array.isArray(value) ? value : [value])
    .filter((pid): pid is number => Number.isInteger(pid) && pid > 0);
}

function configForScope(accessScope: "user" | "system", workingDirectory = process.cwd()): McpServerConfig {
  return {
    ...terminalDefinition,
    systemConfig: {
      ...terminalDefinition.systemConfig,
      accessScope,
      workingDirectory,
    },
  };
}

test("detected shell executes commands with its declared dialect and UTF-8 output", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const separator = resolution.profile.dialect === "powershell" ? ";" : "&&";
  const result = await executeTerminalTool(terminalDefinition, "Terminal", {
    command: `node --version ${separator} npm --version ${separator} node -e "process.stdout.write('gültiges')"`,
    cwd: process.cwd(),
  });

  assert.ok(result);
  assert.equal(result.isError, false);
  assert.match(result.content, /gültiges/);
  assert.match(result.content, /\[exit code: 0\]/);
  assert.equal(result.metadata?.shell, resolution.profile.kind);
  assert.equal(result.metadata?.privilege, "current_user");
  assert.equal(result.metadata?.accessScope, "user");
});

test("system scope expands the root without elevating the shell process", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const result = await executeTerminalTool(configForScope("system"), "Terminal", {
    command: "node -e \"process.stdout.write('out'); process.stderr.write('err')\"",
    cwd: process.cwd(),
  });

  assert.ok(result);
  assert.equal(result.isError, false);
  assert.match(result.content, /out/);
  assert.match(result.content, /err/);
  assert.equal(result.metadata?.accessScope, "system");
  assert.equal(result.metadata?.privilege, "current_user");
  assert.equal(Object.hasOwn(result.metadata ?? {}, "elevated"), false);
});

test("non-zero shell exits are returned as model-visible tool errors", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const result = await executeTerminalTool(terminalDefinition, "Terminal", {
    command: "node -e \"process.exit(7)\"",
    cwd: process.cwd(),
  });

  assert.ok(result);
  assert.equal(result.isError, true);
  assert.match(result.content, /\[exit code: 7\]/);
  assert.equal(result.metadata?.errorKind, "exit_code");
});

test("POSIX pipelines propagate a failing command through pipefail", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }
  if (resolution.profile.dialect !== "posix" || resolution.profile.kind === "sh") {
    t.skip("The active shell does not provide Bash-compatible pipefail semantics.");
    return;
  }

  const result = await executeTerminalTool(terminalDefinition, "Terminal", {
    command: "node -e \"process.exit(7)\" | node -e \"process.stdin.resume()\"",
    cwd: process.cwd(),
  });

  assert.ok(result);
  assert.equal(result.isError, true);
  assert.match(result.content, /\[exit code: 7\]/);
  assert.equal(result.metadata?.errorKind, "exit_code");
});

test("background execution uses the same detected shell and writes status and UTF-8 output", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-test-"));
  try {
    const result = await runWithSessionId("background-completion-test", () => executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"setTimeout(() => process.stdout.write('hintergründig'), 50)\"",
      cwd,
      run_in_background: true,
    }));
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.shell, resolution.profile.kind);
    assert.equal(result.metadata?.privilege, "current_user");

    const statusPath = String(result.metadata?.statusPath ?? "");
    const stdoutPath = String(result.metadata?.stdoutPath ?? "");
    let status = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      status = await readFile(statusPath, "utf8").catch(() => "");
      if (status.includes('"status": "completed"')) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.match(status, /"status": "completed"/);
    assert.match(status, /"privilege": "current_user"/);
    assert.doesNotMatch(status, /"elevated"/);
    assert.match(await readFile(stdoutPath, "utf8"), /hintergründig/);
  } finally {
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("an explicit background timeout terminates the process and updates its status", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-timeout-test-"));
  try {
    const result = await runWithSessionId("background-timeout-test", () => executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"setTimeout(() => {}, 5000)\"",
      cwd,
      run_in_background: true,
      timeoutMs: 100,
    }));
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.timeoutMs, 100);

    const statusPath = String(result.metadata?.statusPath ?? "");
    let status = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      status = await readFile(statusPath, "utf8").catch(() => "");
      if (status.includes('"status": "timed_out"')) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.match(status, /"status": "timed_out"/);
    assert.match(status, /"timedOut": true/);
    assert.match(status, /"privilege": "current_user"/);
  } finally {
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("foreground timeout terminates the shell process tree", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const result = await executeTerminalTool(terminalDefinition, "Terminal", {
    command: "node -e \"setTimeout(() => {}, 5000)\"",
    cwd: process.cwd(),
    timeoutMs: 100,
  });

  assert.ok(result);
  assert.equal(result.isError, true);
  assert.equal(result.metadata?.timedOut, true);
  assert.equal(result.metadata?.errorKind, "timeout");
  assert.match(result.content, /timed out after 100ms/);
});

test("run abort terminates an active foreground shell process", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const abortController = new AbortController();
  const execution = executeTerminalTool(terminalDefinition, "Terminal", {
    command: "node -e \"setTimeout(() => {}, 5000)\"",
    cwd: process.cwd(),
    timeoutMs: 10000,
  }, {
    values: {},
    abortSignal: abortController.signal,
  });
  setTimeout(() => abortController.abort(), 100);
  const result = await execution;

  assert.ok(result);
  assert.equal(result.isError, true);
  assert.equal(result.metadata?.interrupted, true);
  assert.equal(result.metadata?.errorKind, "abort");
  if (process.platform === "win32") {
    assert.equal(result.metadata?.terminationMethod, "windows_job_msys_group");
    assert.equal(result.metadata?.terminationVerified, true);
    assert.ok(Number(result.metadata?.terminationDurationMs) < 8_000);
  }
  assert.match(result.content, /\[interrupted\]/);
});

test("managed background tasks expose status and stop through their task id", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const sessionId = "background-stop-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-stop-test-"));
  try {
    const started = await runWithSessionId(sessionId, () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "run",
      command: "node -e \"setTimeout(() => {}, 10000)\"",
      cwd,
      run_in_background: true,
    }));
    assert.ok(started);
    assert.equal(started.isError, false, JSON.stringify(started, null, 2));
    const taskId = String(started.metadata?.taskId ?? "");
    assert.ok(taskId);

    const context = buildRuntimeContext({
      sessionId,
      modeId: "edit",
      modeName: "edit",
      model: "test-model",
      runtimeVariables: {
        TERMINAL_ACCESS_SCOPE: "user",
        TERMINAL_ROOT: cwd,
        TERMINAL_CWD: cwd,
        TERMINAL_SHELL: resolution.profile.displayName,
        TERMINAL_PRIVILEGE: "current_user",
      },
    });
    assert.match(context, /<terminal_tasks>/);
    assert.match(context, new RegExp(`id=${taskId}`));
    assert.match(context, /\[running\]/);
    assert.doesNotMatch(context, /stdoutPath|stderrPath|\bpid=/i);

    const foreignStatus = await runWithSessionId("foreign-session", () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "status",
      taskId,
    }));
    assert.ok(foreignStatus);
    assert.equal(foreignStatus.isError, true);
    assert.equal(foreignStatus.metadata?.errorKind, "task_not_found");

    const status = await runWithSessionId(sessionId, () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "status",
      taskId,
    }));
    assert.ok(status);
    assert.equal(status.isError, false);
    assert.equal(status.metadata?.status, "running");

    const stopped = await runWithSessionId(sessionId, () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "stop",
      taskId,
    }));
    assert.ok(stopped);
    assert.equal(stopped.metadata?.status, "stopped", JSON.stringify(stopped, null, 2));

    const statusJson = await readFile(String(started.metadata?.statusPath ?? ""), "utf8");
    assert.match(statusJson, /"status": "stopped"/);
    assert.doesNotMatch(buildRuntimeContext({
      sessionId,
      modeId: "edit",
      modeName: "edit",
      model: "test-model",
      runtimeVariables: {
        TERMINAL_ACCESS_SCOPE: "user",
        TERMINAL_ROOT: cwd,
      },
    }), /<terminal_tasks>/);
  } finally {
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("stopping a Git Bash task terminates nested children without waiting for inherited pipes", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }
  if (resolution.profile.kind !== "git-bash") {
    t.skip("This regression specifically covers the Windows Git Bash process tree.");
    return;
  }

  const sessionId = "background-nested-stop-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-nested-stop-test-"));
  const baselinePids = new Set(await windowsSleepPids());
  const childPids: number[] = [];
  try {
    const started = await runWithSessionId(sessionId, () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "run",
      command: "sh -c \"sleep 600 & sleep 600 & wait\"",
      cwd,
      run_in_background: true,
    }));
    assert.ok(started);
    assert.equal(started.isError, false, JSON.stringify(started, null, 2));
    const taskId = String(started.metadata?.taskId ?? "");

    for (let attempt = 0; attempt < 40; attempt += 1) {
      childPids.splice(0, childPids.length, ...(await windowsSleepPids()).filter((pid) => !baselinePids.has(pid)));
      if (childPids.length === 2) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.equal(childPids.length, 2, `Expected exactly two managed sleep.exe children, got ${childPids.join(", ")}`);

    const startedStoppingAt = Date.now();
    const stopped = await runWithSessionId(sessionId, () => executeTerminalTool(terminalDefinition, "Terminal", {
      action: "stop",
      taskId,
    }));
    assert.ok(stopped);
    assert.ok(Date.now() - startedStoppingAt < 8_000, "Nested task stop exceeded its hard deadline");

    for (const pid of childPids) {
      let alive = true;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          process.kill(pid, 0);
        } catch {
          alive = false;
          break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      assert.equal(alive, false, `Nested child process ${pid} survived Terminal stop`);
    }
    assert.equal(stopped.isError, false, JSON.stringify(stopped, null, 2));
    assert.equal(stopped.metadata?.status, "stopped");
    assert.equal(stopped.metadata?.terminationMethod, "windows_job_msys_group");
    assert.equal(stopped.metadata?.terminationVerified, true);
    assert.ok(Number(stopped.metadata?.terminationDurationMs) < 8_000);
    const persisted = JSON.parse(await readFile(String(started.metadata?.statusPath), "utf8")) as Record<string, unknown>;
    assert.equal(persisted.status, "stopped");
    assert.equal(persisted.terminationMethod, "windows_job_msys_group");
    assert.equal(persisted.terminationVerified, true);
    assert.ok(Number(persisted.terminationDurationMs) < 8_000);
  } finally {
    for (const pid of childPids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The expected path already terminated every test child.
      }
    }
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("raw process kills are blocked at runtime", async () => {
  const blocked = await executeTerminalTool(terminalDefinition, "Terminal", {
    command: "taskkill /F /IM node.exe",
    cwd: process.cwd(),
  });
  assert.ok(blocked);
  assert.equal(blocked.isError, true);
  assert.equal(blocked.metadata?.errorKind, "unmanaged_process_termination");
});
