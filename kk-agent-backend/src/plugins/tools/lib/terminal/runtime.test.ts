import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { InternalToolDefinition } from "../../types.js";
import { terminalDefinition } from "./definition.js";
import { executeTerminalTool } from "./runtime.js";
import { getTerminalShellResolution, initializeTerminalShell } from "./shell-profile.js";
import { buildRuntimeContext } from "../../../session/lib/runtime-context.js";
import {
  disposeSessionTerminalTasks,
  setTerminalTaskSessionsRootForTests,
} from "./background-tasks.js";

const execFileAsync = promisify(execFile);
let terminalTaskTestRoot = "";

test.before(async () => {
  terminalTaskTestRoot = await mkdtemp(join(tmpdir(), "kk-agent-terminal-state-test-"));
  setTerminalTaskSessionsRootForTests(terminalTaskTestRoot);
});

test.after(async () => {
  setTerminalTaskSessionsRootForTests();
  await rm(terminalTaskTestRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const sessionContext = (sessionId: string) => ({ sessionId, values: {} });

async function waitForStatus(statusPath: string, expected: "completed" | "timed_out"): Promise<string> {
  const deadline = Date.now() + 12_000;
  let status = "";
  while (Date.now() < deadline) {
    status = await readFile(statusPath, "utf8").catch(() => "");
    if (status.includes(`"status": "${expected}"`)) return status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  return status;
}

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

function configForScope(accessScope: "user" | "system", workingDirectory = process.cwd()): InternalToolDefinition {
  return {
    ...terminalDefinition,
    config: {
      ...terminalDefinition.config,
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

test("fresh foreground shells complete repeatedly without a login-profile warmup", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  for (let index = 0; index < 3; index += 1) {
    const result = await executeTerminalTool(terminalDefinition, "Terminal", {
      command: `echo TERMINAL_READY_${index}`,
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });
    assert.ok(result);
    assert.equal(result.isError, false, JSON.stringify(result, null, 2));
    assert.match(result.content, new RegExp(`TERMINAL_READY_${index}`, "u"));
  }
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

  const sessionId = "background-completion-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-test-"));
  try {
    const result = await executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"setTimeout(() => process.stdout.write('hintergründig', () => process.exit(0)), 50)\"",
      cwd,
      run_in_background: true,
    }, sessionContext(sessionId));
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.shell, resolution.profile.kind);
    assert.equal(result.metadata?.privilege, "current_user");

    const statusPath = String(result.metadata?.statusPath ?? "");
    const stdoutPath = String(result.metadata?.stdoutPath ?? "");
    const taskId = String(result.metadata?.taskId ?? "");
    assert.equal(statusPath, join(terminalTaskTestRoot, sessionId, "terminal-tasks", taskId, "status.json"));
    assert.equal(existsSync(join(cwd, ".kk-agent-shell-tasks")), false);
    const status = await waitForStatus(statusPath, "completed");
    assert.match(status, /"status": "completed"/);
    assert.match(status, /"privilege": "current_user"/);
    assert.doesNotMatch(status, /"elevated"/);
    assert.match(await readFile(stdoutPath, "utf8"), /hintergründig/);
  } finally {
    await disposeSessionTerminalTasks(sessionId);
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

  const sessionId = "background-timeout-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-timeout-test-"));
  try {
    const result = await executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"setTimeout(() => {}, 5000)\"",
      cwd,
      run_in_background: true,
      timeoutMs: 100,
    }, sessionContext(sessionId));
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.timeoutMs, 100);

    const statusPath = String(result.metadata?.statusPath ?? "");
    const status = await waitForStatus(statusPath, "timed_out");
    assert.match(status, /"status": "timed_out"/);
    assert.match(status, /"timedOut": true/);
    assert.match(status, /"privilege": "current_user"/);
  } finally {
    await disposeSessionTerminalTasks(sessionId);
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
    const started = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "run",
      command: "node -e \"setTimeout(() => {}, 10000)\"",
      cwd,
      run_in_background: true,
    }, sessionContext(sessionId));
    assert.ok(started);
    assert.equal(started.isError, false, JSON.stringify(started, null, 2));
    const taskId = String(started.metadata?.taskId ?? "");
    assert.ok(taskId);

    const context = buildRuntimeContext({
      sessionId,
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

    const foreignStatus = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "status",
      taskId,
    }, sessionContext("foreign-session"));
    assert.ok(foreignStatus);
    assert.equal(foreignStatus.isError, true);
    assert.equal(foreignStatus.metadata?.errorKind, "task_not_found");

    const status = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "status",
      taskId,
    }, sessionContext(sessionId));
    assert.ok(status);
    assert.equal(status.isError, false);
    assert.equal(status.metadata?.status, "running");

    const stopped = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "stop",
      taskId,
    }, sessionContext(sessionId));
    assert.ok(stopped);
    assert.equal(stopped.metadata?.status, "stopped", JSON.stringify(stopped, null, 2));

    const statusJson = await readFile(String(started.metadata?.statusPath ?? ""), "utf8");
    assert.match(statusJson, /"status": "stopped"/);
    assert.doesNotMatch(buildRuntimeContext({
      sessionId,
      model: "test-model",
      runtimeVariables: {
        TERMINAL_ACCESS_SCOPE: "user",
        TERMINAL_ROOT: cwd,
      },
    }), /<terminal_tasks>/);
  } finally {
    await disposeSessionTerminalTasks(sessionId);
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("large foreground output completes and remains readable through a session-owned output id", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }
  const sessionId = "large-foreground-output-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-large-output-"));
  try {
    const result = await executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"process.stdout.write('A'.repeat(1100000))\"",
      cwd,
    }, sessionContext(sessionId));
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.outputTruncated, true);
    const outputId = String(result.metadata?.outputId ?? "");
    assert.match(outputId, /^[0-9a-f-]{36}$/u);
    assert.match(result.content, new RegExp(`^\\[terminal output retained\\]\\noutputId: ${outputId}`, "u"));
    assert.match(result.content, /stdoutBytes: 1100000/u);
    assert.ok(result.content.length < 12_000, `retained-output preview was ${result.content.length} characters`);

    const page = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "output",
      outputId,
      stream: "stdout",
      offsetBytes: 1_099_990,
      limitBytes: 10,
    }, sessionContext(sessionId));
    assert.ok(page);
    assert.equal(page.isError, false);
    assert.match(page.content, new RegExp(`^\\[terminal output page\\]\\noutputId: ${outputId}`, "u"));
    assert.match(page.content, /offsetBytes: 1099990/u);
    assert.match(page.content, /bytesReturned: 10/u);
    assert.match(page.content, /\n\nA{10}$/u);
  } finally {
    await disposeSessionTerminalTasks(sessionId);
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("disposing a session stops its background tasks and removes their files", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const sessionId = "background-session-disposal-test";
  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-disposal-test-"));
  const taskRoot = join(terminalTaskTestRoot, sessionId, "terminal-tasks");
  try {
    const started = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "run",
      command: "node -e \"setTimeout(() => {}, 10000)\"",
      cwd,
      run_in_background: true,
    }, sessionContext(sessionId));
    assert.ok(started);
    assert.equal(started.isError, false, JSON.stringify(started, null, 2));
    const taskId = String(started.metadata?.taskId ?? "");
    assert.equal(existsSync(taskRoot), true);

    await disposeSessionTerminalTasks(sessionId);

    assert.equal(existsSync(taskRoot), false);
    const status = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "status",
      taskId,
    }, sessionContext(sessionId));
    assert.equal(status?.metadata?.errorKind, "task_not_found");
    assert.equal(existsSync(join(cwd, ".kk-agent-shell-tasks")), false);
  } finally {
    await disposeSessionTerminalTasks(sessionId);
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
    const started = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "run",
      command: "sh -c \"sleep 600 & sleep 600 & wait\"",
      cwd,
      run_in_background: true,
    }, sessionContext(sessionId));
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
    const stopped = await executeTerminalTool(terminalDefinition, "Terminal", {
      action: "stop",
      taskId,
    }, sessionContext(sessionId));
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
    await disposeSessionTerminalTasks(sessionId);
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
