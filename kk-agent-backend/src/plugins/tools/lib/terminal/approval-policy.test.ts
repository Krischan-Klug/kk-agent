import assert from "node:assert/strict";
import test from "node:test";
import {
  getTerminalApprovalInstruction,
  resolveApprovalMode,
  resolveTerminalCommandPermission,
  TERMINAL_RUN_GRANT_KEY,
} from "./approval-policy.js";

test("approval mode defaults to ask approval and resolves full access explicitly", () => {
  assert.equal(resolveApprovalMode(), "ask_approval");
  assert.equal(resolveApprovalMode("ask_approval"), "ask_approval");
  assert.equal(resolveApprovalMode("full_access"), "full_access");
});

test("ask approval permits safe commands and prompts for destructive commands", () => {
  assert.deepEqual(resolveTerminalCommandPermission({
    command: "git status",
    modeBehavior: "edit",
    shellDialect: "posix",
    approvalMode: "ask_approval",
  }), { kind: "allow" });

  const destructive = resolveTerminalCommandPermission({
    command: "rm -rf build",
    modeBehavior: "edit",
    shellDialect: "posix",
    approvalMode: "ask_approval",
  });
  assert.equal(destructive.kind, "prompt");
  if (destructive.kind !== "prompt") return;
  assert.deepEqual(destructive.allowKeys, ["allow_once", "allow_run"]);
  assert.equal(destructive.runGrantKey, TERMINAL_RUN_GRANT_KEY);
  assert.deepEqual(destructive.grantForRunKeys, ["allow_run"]);
});

test("full access bypasses approval without bypassing plan mode", () => {
  assert.deepEqual(resolveTerminalCommandPermission({
    command: "rm -rf build",
    modeBehavior: "edit",
    shellDialect: "posix",
    approvalMode: "full_access",
  }), { kind: "allow" });

  const planResult = resolveTerminalCommandPermission({
    command: "rm -rf build",
    modeBehavior: "plan",
    shellDialect: "posix",
    approvalMode: "full_access",
  });
  assert.equal(planResult.kind, "deny");
});

test("dynamic instructions tell the model who owns approval", () => {
  assert.match(getTerminalApprovalInstruction("ask_approval"), /harness automatically requests approval/i);
  assert.match(getTerminalApprovalInstruction("full_access"), /without asking the user/i);
  assert.match(getTerminalApprovalInstruction("full_access"), /never use ask_user/i);
});
