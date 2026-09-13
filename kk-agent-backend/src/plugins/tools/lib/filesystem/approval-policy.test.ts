import assert from "node:assert/strict";
import test from "node:test";
import { FILESYSTEM_REMOVE_GRANT_KEY, resolveFilesystemToolPermission } from "./approval-policy.js";

test("filesystem removal requires approval in ask mode", () => {
  const policy = resolveFilesystemToolPermission({
    toolName: "Remove",
    args: { path: "C:\\tmp\\file.txt" },
    approvalMode: "ask_approval",
  });
  assert.equal(policy.kind, "prompt");
  if (policy.kind !== "prompt") return;
  assert.equal(policy.runGrantKey, FILESYSTEM_REMOVE_GRANT_KEY);
  assert.deepEqual(policy.allowKeys, ["allow_once", "allow_run"]);
});

test("filesystem removal follows full-access mode and validates its path", () => {
  assert.deepEqual(resolveFilesystemToolPermission({
    toolName: "Remove",
    args: { path: "C:\\tmp\\file.txt" },
    approvalMode: "full_access",
  }), { kind: "allow" });
  assert.equal(resolveFilesystemToolPermission({
    toolName: "Remove",
    args: {},
    approvalMode: "full_access",
  }).kind, "deny");
});

test("non-destructive filesystem tools remain approval-free", () => {
  assert.deepEqual(resolveFilesystemToolPermission({
    toolName: "Copy",
    args: { source: "a", destination: "b" },
    approvalMode: "ask_approval",
  }), { kind: "allow" });
});
