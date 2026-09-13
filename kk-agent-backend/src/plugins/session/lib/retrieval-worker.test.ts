import assert from "node:assert/strict";
import test from "node:test";
import { shouldDetachRetrievalWorker } from "./retrieval-worker.js";

test("retrieval worker stays in the hidden parent process on Windows", () => {
  assert.equal(shouldDetachRetrievalWorker("win32"), false);
});

test("retrieval worker keeps a process group on POSIX", () => {
  assert.equal(shouldDetachRetrievalWorker("linux"), true);
  assert.equal(shouldDetachRetrievalWorker("darwin"), true);
});
