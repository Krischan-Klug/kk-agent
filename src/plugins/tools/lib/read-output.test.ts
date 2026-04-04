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
