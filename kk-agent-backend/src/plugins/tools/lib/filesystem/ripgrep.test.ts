import assert from "node:assert/strict";
import test from "node:test";
import { globWithRipgrep, isRipgrepAvailable } from "./ripgrep.js";

test("ripgrep search honors an already-aborted run signal", async (t) => {
  if (!await isRipgrepAvailable()) {
    t.skip("ripgrep is unavailable");
    return;
  }

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    globWithRipgrep({
      root: process.cwd(),
      pattern: "**/*",
      limit: 10,
      abortSignal: controller.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
