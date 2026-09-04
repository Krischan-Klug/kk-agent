import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveApprovalMode,
  resolveTerminalCommandPermission,
  TERMINAL_RUN_GRANT_KEY,
} from "./approval-policy.js";

test("approval setting defaults to ask approval and resolves full access explicitly", () => {
  assert.equal(resolveApprovalMode(), "ask_approval");
  assert.equal(resolveApprovalMode("ask_approval"), "ask_approval");
  assert.equal(resolveApprovalMode("full_access"), "full_access");
});

test("ask approval permits safe commands and prompts for destructive commands", () => {
  assert.deepEqual(resolveTerminalCommandPermission({
    command: "git status",
    shellDialect: "posix",
    approvalMode: "ask_approval",
  }), { kind: "allow" });

  const destructive = resolveTerminalCommandPermission({
    command: "rm -rf build",
    shellDialect: "posix",
    approvalMode: "ask_approval",
  });
  assert.equal(destructive.kind, "prompt");
  if (destructive.kind !== "prompt") return;
  assert.deepEqual(destructive.allowKeys, ["allow_once", "allow_run"]);
  assert.equal(destructive.runGrantKey, TERMINAL_RUN_GRANT_KEY);
  assert.deepEqual(destructive.grantForRunKeys, ["allow_run"]);
});

test("full access bypasses destructive-command approval", () => {
  assert.deepEqual(resolveTerminalCommandPermission({
    command: "rm -rf build",
    shellDialect: "posix",
    approvalMode: "full_access",
  }), { kind: "allow" });
});

test("managed task operations are validated and broad kills stay denied", () => {
  assert.deepEqual(resolveTerminalCommandPermission({
    action: "status",
    command: "",
    taskId: "task-1",
    shellDialect: "posix",
    approvalMode: "full_access",
  }), { kind: "allow" });

  assert.deepEqual(resolveTerminalCommandPermission({
    action: "stop",
    command: "",
    taskId: "task-1",
    shellDialect: "posix",
    approvalMode: "ask_approval",
  }), { kind: "allow" });

  assert.equal(resolveTerminalCommandPermission({
    command: "taskkill /F /IM node.exe",
    shellDialect: "powershell",
    approvalMode: "full_access",
  }).kind, "deny");
});
