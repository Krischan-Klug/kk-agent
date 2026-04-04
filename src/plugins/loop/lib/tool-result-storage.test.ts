import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { STATE_DIR } from "../../lib/state.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";

test("persistLargeToolResult stores oversized outputs and returns a preview", async () => {
  const content = "A".repeat(13_000);
  const preview = await persistLargeToolResult("tool-test", "read_file", content);

  assert.ok(preview.includes("stored full read_file result"));
  await access(join(STATE_DIR, "tool-results", "tool-test.txt"));
});

test("fitToolResultsToBudget truncates oversized aggregate batches", () => {
  const budgeted = fitToolResultsToBudget([
    { toolName: "read_file", content: "A".repeat(20_000) },
    { toolName: "grep", content: "B".repeat(20_000) },
  ]);

  assert.equal(budgeted.length, 2);
  assert.ok(budgeted[1]?.includes("truncated to fit tool result budget"));
});

