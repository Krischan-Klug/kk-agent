import test from "node:test";
import assert from "node:assert/strict";
import {
  getShellPermissionPrompt,
  isDestructiveShellCommand,
  isReadOnlyShellCommand,
} from "./command-policy.js";

test("isReadOnlyShellCommand accepts inspection commands and rejects mutating ones", () => {
  assert.equal(isReadOnlyShellCommand("git status"), true);
  assert.equal(isReadOnlyShellCommand("Get-Content README.md"), true);
  assert.equal(
    isReadOnlyShellCommand('find "C:\\Users\\KriKra\\dev\\ai\\claude-code" -maxdepth 1 -type f -name "package.json"'),
    true,
  );
  assert.equal(
    isReadOnlyShellCommand('dir /s /b "C:\\Users\\KriKra\\dev\\ai\\claude-code\\src" 2>nul'),
    true,
  );
  assert.equal(
    isReadOnlyShellCommand('tree /f "C:\\Users\\KriKra\\dev\\ai\\claude-code\\src" 2>nul || dir /s /b "C:\\Users\\KriKra\\dev\\ai\\claude-code\\src"'),
    true,
  );
  assert.equal(isReadOnlyShellCommand("npm install"), false);
  assert.equal(isReadOnlyShellCommand("Remove-Item README.md"), false);
  assert.equal(isReadOnlyShellCommand("echo hi > out.txt"), false);
});

test("isDestructiveShellCommand catches clearly dangerous commands", () => {
  assert.equal(isDestructiveShellCommand("git reset --hard"), true);
  assert.equal(isDestructiveShellCommand("rm -rf dist"), true);
  assert.equal(isDestructiveShellCommand("git status"), false);
});

test("getShellPermissionPrompt returns an allow-once user prompt", () => {
  const prompt = getShellPermissionPrompt("git reset --hard");
  assert.ok(prompt.question.includes("git reset --hard"));
  assert.deepEqual(prompt.allowKeys, ["allow_once"]);
});
