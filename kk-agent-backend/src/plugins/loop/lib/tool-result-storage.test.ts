import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { getStateDirPath } from "../../lib/state.js";
import { fitToolResultsToBudget, persistLargeToolResult } from "./tool-result-storage.js";

test("persistLargeToolResult skips persistence for self-bounded read tools", async () => {
  const content = "A".repeat(13_000);
  const storedPath = getStateDirPath("tool-results", "tool-test-read.txt");
  const preview = await persistLargeToolResult("tool-test-read", "Read", content, {
    persistLargeResults: false,
  });

  assert.equal(preview, content);
  await assert.rejects(access(storedPath));
});

test("persistLargeToolResult stores oversized outputs for regular tools and returns a preview", async () => {
  const content = "A".repeat(13_000);
  const storedPath = getStateDirPath("tool-results", "tool-test-grep.txt");
  const preview = await persistLargeToolResult("tool-test-grep", "Grep", content);

  assert.ok(preview.includes("stored full Grep result"));
  assert.ok(preview.includes(storedPath));
  await access(storedPath);
});

test("fitToolResultsToBudget keeps self-bounded read results out of aggregate truncation", () => {
  const budgeted = fitToolResultsToBudget([
    { toolName: "Read", content: "A".repeat(20_000), policy: { excludeFromContextBudget: true } },
    { toolName: "Grep", content: "B".repeat(20_000) },
  ]);

  assert.equal(budgeted.length, 2);
  assert.equal(budgeted[0], "A".repeat(20_000));
  assert.equal(budgeted[1], "B".repeat(20_000));
});

test("fitToolResultsToBudget still truncates oversized non-read batches", () => {
  const budgeted = fitToolResultsToBudget([
    { toolName: "Grep", content: "A".repeat(20_000) },
    { toolName: "Glob", content: "B".repeat(20_000) },
  ]);

  assert.equal(budgeted.length, 2);
  assert.ok(budgeted[1]?.includes("truncated to fit tool result budget"));
});
