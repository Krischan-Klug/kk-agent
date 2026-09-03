import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInternalToolConfig } from "./internal-tool-config.js";

test("tool config strips security-owned fields", () => {
  const config = normalizeInternalToolConfig({
    accessScope: "system",
    approvalMode: "full_access",
    workingDirectory: "C:\\",
    resultPolicy: { previewChars: 500 },
  });
  assert.deepEqual(config, { resultPolicy: { previewChars: 500 } });
});
