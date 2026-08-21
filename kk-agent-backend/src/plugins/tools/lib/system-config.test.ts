import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSystemConfig } from "./system-config.js";

test("tool config strips security-owned fields", () => {
  const config = normalizeSystemConfig("terminal", {
    accessScope: "system",
    approvalMode: "full_access",
    workingDirectory: "C:\\",
    resultPolicy: { previewChars: 500 },
  });
  assert.deepEqual(config, { resultPolicy: { previewChars: 500 } });
});
