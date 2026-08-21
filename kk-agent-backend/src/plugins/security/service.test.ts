import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSecuritySettings } from "./service.js";

test("scope and approval defaults remain independent", () => {
  assert.deepEqual(normalizeSecuritySettings(), {
    accessScope: "user",
    approvalMode: "ask_approval",
  });
  assert.deepEqual(normalizeSecuritySettings({ accessScope: "system" }), {
    accessScope: "system",
    approvalMode: "ask_approval",
  });
  assert.deepEqual(normalizeSecuritySettings({ approvalMode: "full_access" }), {
    accessScope: "user",
    approvalMode: "full_access",
  });
});
