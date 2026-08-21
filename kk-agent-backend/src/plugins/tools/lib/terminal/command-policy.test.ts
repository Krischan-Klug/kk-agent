import assert from "node:assert/strict";
import test from "node:test";
import { isDestructiveShellCommand, isReadOnlyShellCommand } from "./command-policy.js";

test("read-only policy understands POSIX compound commands", () => {
  assert.equal(isReadOnlyShellCommand("node --version && npm -v", "posix"), true);
  assert.equal(isReadOnlyShellCommand("git status || echo missing", "posix"), true);
  assert.equal(isReadOnlyShellCommand("npm run build", "posix"), false);
});

test("read-only policy understands PowerShell commands without treating Bash operators as separators", () => {
  assert.equal(isReadOnlyShellCommand("Get-ChildItem; Get-Content package.json", "powershell"), true);
  assert.equal(isReadOnlyShellCommand("Get-ChildItem | Select-String src", "powershell"), true);
  assert.equal(isReadOnlyShellCommand("Set-Content file.txt value", "powershell"), false);
});

test("destructive policy remains independent from access elevation", () => {
  assert.equal(isDestructiveShellCommand("rm -rf build"), true);
  assert.equal(isDestructiveShellCommand("Remove-Item build -Recurse"), true);
  assert.equal(isDestructiveShellCommand("git status"), false);
});
