import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminalDefinition } from "./definition.js";
import { executeTerminalTool } from "./runtime.js";
import { getTerminalShellResolution, initializeTerminalShell } from "./shell-profile.js";

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

test("background execution uses the same detected shell and writes status and UTF-8 output", async (t) => {
  initializeTerminalShell();
  const resolution = getTerminalShellResolution();
  if (resolution.status === "unavailable") {
    t.skip(resolution.error);
    return;
  }

  const cwd = await mkdtemp(join(tmpdir(), "kk-agent-terminal-test-"));
  try {
    const result = await executeTerminalTool(terminalDefinition, "Terminal", {
      command: "node -e \"setTimeout(() => process.stdout.write('hintergründig'), 50)\"",
      cwd,
      run_in_background: true,
    });
    assert.ok(result);
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.shell, resolution.profile.kind);

    const statusPath = String(result.metadata?.statusPath ?? "");
    const stdoutPath = String(result.metadata?.stdoutPath ?? "");
    let status = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      status = await readFile(statusPath, "utf8").catch(() => "");
      if (status.includes('"status": "completed"')) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.match(status, /"status": "completed"/);
    assert.match(await readFile(stdoutPath, "utf8"), /hintergründig/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
