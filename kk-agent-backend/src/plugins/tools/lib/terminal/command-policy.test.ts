import assert from "node:assert/strict";
import test from "node:test";
import {
  isDestructiveShellCommand,
  isReadOnlyShellCommand,
  isUnmanagedProcessTerminationCommand,
} from "./command-policy.js";

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

test("unmanaged process termination is detected without blocking an ordinary kill text search", () => {
  assert.equal(isUnmanagedProcessTerminationCommand("taskkill /F /IM node.exe"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("Get-Process node | Stop-Process -Force"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("pkill -f next"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("kill $(cat server.pid)"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("pgrep node | xargs kill -9"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("node -e \"process.kill(1234)\""), true);
  assert.equal(isUnmanagedProcessTerminationCommand("wmic process where name='node.exe' delete"), true);
  assert.equal(isUnmanagedProcessTerminationCommand("rg -n \"kill\" src"), false);
});
