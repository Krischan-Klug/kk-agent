import assert from "node:assert/strict";
import test from "node:test";
import { AbortableInflightMap } from "./inflight.js";

test("in-flight work is shared by concurrent consumers", async () => {
  const inflight = new AbortableInflightMap<string>();
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const work = async () => {
    calls += 1;
    await gate;
    return "done";
  };
  const first = inflight.run("query", work);
  const second = inflight.run("query", work);
  release();
  assert.deepEqual(await Promise.all([first, second]), [
    { value: "done", reused: false },
    { value: "done", reused: true },
  ]);
  assert.equal(calls, 1);
});

test("one cancelled consumer does not abort work needed by another consumer", async () => {
  const inflight = new AbortableInflightMap<string>();
  const firstController = new AbortController();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const work = async (signal: AbortSignal) => {
    await gate;
    assert.equal(signal.aborted, false);
    return "done";
  };
  const first = inflight.run("query", work, firstController.signal);
  const second = inflight.run("query", work);
  firstController.abort();
  release();
  await assert.rejects(first, /aborted/u);
  assert.deepEqual(await second, { value: "done", reused: true });
});
