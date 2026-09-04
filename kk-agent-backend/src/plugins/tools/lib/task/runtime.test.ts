import assert from "node:assert/strict";
import test from "node:test";
import { updateTasks } from "../task-state.js";

test("task updates reject id-only no-op requests", async () => {
  await assert.rejects(
    updateTasks("schema-only-test", [{ id: "1" }]),
    /requires a title or notes change/u,
  );
});
