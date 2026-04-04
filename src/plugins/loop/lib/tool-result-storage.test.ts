import test from "node:test";
import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { STATE_DIR } from "../../lib/state.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";

test("persistLargeToolResult skips persistence for self-bounded read tools", async () => {
  const content = "A".repeat(13_000);
  await rm(join(STATE_DIR, "tool-results", "tool-test-read.txt"), { force: true });
  const preview = await persistLargeToolResult("tool-test-read", "read_file", content, {
    persistLargeResults: false,
  });

  assert.equal(preview, content);
  await assert.rejects(access(join(STATE_DIR, "tool-results", "tool-test-read.txt")));
});

test("persistLargeToolResult stores oversized outputs for regular tools and returns a preview", async () => {
  const content = "A".repeat(13_000);
  const storedPath = join(STATE_DIR, "tool-results", "tool-test-grep.txt");
  await rm(storedPath, { force: true });
  const preview = await persistLargeToolResult("tool-test-grep", "grep", content);

  assert.ok(preview.includes("stored full grep result"));
  await access(storedPath);
  await rm(storedPath, { force: true });
});

test("fitToolResultsToBudget keeps self-bounded read results out of aggregate truncation", () => {
  const budgeted = fitToolResultsToBudget([
    { toolName: "read_file", content: "A".repeat(20_000), policy: { excludeFromContextBudget: true } },
    { toolName: "grep", content: "B".repeat(20_000) },
  ]);

  assert.equal(budgeted.length, 2);
  assert.equal(budgeted[0], "A".repeat(20_000));
  assert.equal(budgeted[1], "B".repeat(20_000));
});

test("fitToolResultsToBudget still truncates oversized non-read batches", () => {
  const budgeted = fitToolResultsToBudget([
    { toolName: "grep", content: "A".repeat(20_000) },
    { toolName: "list_directory", content: "B".repeat(20_000) },
  ]);

  assert.equal(budgeted.length, 2);
  assert.ok(budgeted[1]?.includes("truncated to fit tool result budget"));
});
