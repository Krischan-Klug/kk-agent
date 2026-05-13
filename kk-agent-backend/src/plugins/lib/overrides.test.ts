import test from "node:test";
import assert from "node:assert/strict";
import { applyOverrides, diffOverrides, deepClone, deepEqual, hasOverride } from "./overrides.js";

test("deepClone clones nested objects", () => {
  const original = { a: 1, b: { c: [1, 2, 3] } };
  const cloned = deepClone(original);
  assert.deepEqual(cloned, original);
  assert.notStrictEqual(cloned, original);
  assert.notStrictEqual(cloned.b, original.b);
  assert.notStrictEqual(cloned.b.c, original.b.c);
});

test("deepEqual returns true for identical nested objects", () => {
  assert.equal(deepEqual({ a: { b: 1 } }, { a: { b: 1 } }), true);
});

test("deepEqual returns false for different nested objects", () => {
  assert.equal(deepEqual({ a: { b: 1 } }, { a: { b: 2 } }), false);
});

test("hasOverride returns false for undefined", () => {
  assert.equal(hasOverride(undefined), false);
});

test("hasOverride returns true for primitives", () => {
  assert.equal(hasOverride(0), true);
  assert.equal(hasOverride(""), true);
  assert.equal(hasOverride(false), true);
});

test("hasOverride returns false for empty object/array", () => {
  assert.equal(hasOverride({}), false);
  assert.equal(hasOverride([]), false);
});

test("applyOverrides returns deep clone of base when no overrides", () => {
  const base = { a: 1, b: { c: 2 } };
  const result = applyOverrides(base);
  assert.deepEqual(result, base);
  assert.notStrictEqual(result, base);
});

test("applyOverrides merges nested objects recursively", () => {
  const base = { a: 1, b: { c: 2, d: 3 } };
  const overrides = { b: { c: 99 } };
  const result = applyOverrides(base, overrides as Partial<typeof base>);
  assert.deepEqual(result, { a: 1, b: { c: 99, d: 3 } });
});

test("applyOverrides replaces arrays as whole", () => {
  const base = { arr: [1, 2, 3] };
  const overrides = { arr: [4, 5] };
  const result = applyOverrides(base, overrides);
  assert.deepEqual(result.arr, [4, 5]);
});

test("applyOverrides does not mutate base", () => {
  const base = { a: 1, b: { c: 2 } };
  const overrides = { b: { c: 99 } };
  applyOverrides(base, overrides);
  assert.deepEqual(base, { a: 1, b: { c: 2 } });
});

test("applyOverrides does not mutate overrides", () => {
  const base = { a: 1 };
  const overrides = { b: { c: 2 } };
  applyOverrides(base, overrides as Partial<typeof base>);
  assert.deepEqual(overrides, { b: { c: 2 } });
});

test("applyOverrides treats undefined as no override", () => {
  const base = { a: 1, b: 2 };
  const overrides = { a: undefined };
  const result = applyOverrides(base, overrides as Partial<typeof base>);
  assert.deepEqual(result, { a: 1, b: 2 });
});

test("applyOverrides treats null as real value", () => {
  const base = { a: "value" };
  const overrides = { a: null };
  const result = applyOverrides(base, overrides as unknown as Partial<typeof base>);
  assert.deepEqual(result, { a: null });
});

test("diffOverrides returns empty object when values are equal", () => {
  const base = { a: 1, b: { c: 2 } };
  const effective = { a: 1, b: { c: 2 } };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, {});
});

test("diffOverrides stores changed nested strings", () => {
  const base = { a: 1, b: { c: "hello", d: "world" } };
  const effective = { a: 1, b: { c: "hello", d: "changed" } };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { b: { d: "changed" } });
});

test("diffOverrides stores empty string as override when base is not empty", () => {
  const base = { a: "hello" };
  const effective = { a: "" };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { a: "" });
});

test("diffOverrides returns empty object for identical arrays", () => {
  const base = { arr: [1, 2, 3] };
  const effective = { arr: [1, 2, 3] };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, {});
});

test("diffOverrides stores different arrays completely", () => {
  const base = { arr: [1, 2, 3] };
  const effective = { arr: [1, 2] };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { arr: [1, 2] });
});

test("diffOverrides stores keys that exist in effective but not in base", () => {
  const base = { a: 1 };
  const effective = { a: 1, b: 2 };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { b: 2 });
});

test("diffOverrides removes empty nested diff objects", () => {
  const base = { a: { x: 1 }, b: 2 };
  const effective = { a: { x: 1 }, b: 3 };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { b: 3 });
});

test("diffOverrides handles deep nested objects", () => {
  const base = { a: { b: { c: { d: 1 } } } };
  const effective = { a: { b: { c: { d: 2, e: 3 } } } };
  const diff = diffOverrides(base, effective);
  assert.deepEqual(diff, { a: { b: { c: { d: 2, e: 3 } } } });
});
