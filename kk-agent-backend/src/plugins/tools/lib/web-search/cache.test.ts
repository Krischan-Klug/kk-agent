import assert from "node:assert/strict";
import test from "node:test";
import { TtlLruCache } from "./cache.js";

test("TTL cache expires entries and evicts the least recently used key", (t) => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });

  const cache = new TtlLruCache<string>(2, 100);
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "A");
  now = 1_100;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), undefined);
});
