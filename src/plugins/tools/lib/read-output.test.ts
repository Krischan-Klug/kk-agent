import test from "node:test";
import assert from "node:assert/strict";
import { truncateSelfBoundedReadOutput } from "./read-output.js";

test("truncateSelfBoundedReadOutput leaves small reads untouched", () => {
  const content = "line 1\nline 2";
  assert.equal(truncateSelfBoundedReadOutput(content, 100), content);
});

test("truncateSelfBoundedReadOutput trims oversized reads with a narrowing hint", () => {
  const content = `header\n${"A".repeat(10_000)}`;
  const truncated = truncateSelfBoundedReadOutput(content, 1_000);

  assert.ok(truncated.includes("output truncated to stay within read tool limit"));
  assert.ok(truncated.includes("Narrow the read with offset and limit."));
  assert.ok(truncated.length < content.length);
});

test("truncateSelfBoundedReadOutput cuts at last newline when in upper half of budget", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1} ${"x".repeat(40)}`);
  const content = lines.join("\n");
  const truncated = truncateSelfBoundedReadOutput(content, 200);

  assert.ok(truncated.includes("output truncated"));
  const preview = truncated.split("\n...\n")[0];
  // preview should end at a newline boundary - last char of preview should be end of a complete line
  const previewLines = preview.split("\n");
  const lastLine = previewLines[previewLines.length - 1];
  assert.ok(lastLine.startsWith("line "), "preview should end with a complete line");
});

test("truncateSelfBoundedReadOutput handles content without newlines", () => {
  const content = "A".repeat(500);
  const truncated = truncateSelfBoundedReadOutput(content, 100);

  assert.ok(truncated.includes("output truncated"));
  assert.ok(truncated.includes("500 chars total"));
});

test("truncateSelfBoundedReadOutput returns content exactly at limit untouched", () => {
  const content = "A".repeat(100);
  assert.equal(truncateSelfBoundedReadOutput(content, 100), content);
});

test("truncateSelfBoundedReadOutput handles empty content", () => {
  assert.equal(truncateSelfBoundedReadOutput("", 100), "");
});
