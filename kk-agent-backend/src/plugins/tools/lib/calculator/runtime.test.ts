import assert from "node:assert/strict";
import test from "node:test";
import { calculatorDefinition } from "./definition.js";
import { calculate } from "./engine.js";
import { executeCalculatorTool } from "./runtime.js";

test("calculator evaluates precise arithmetic and percentages", () => {
  assert.equal(calculate("0.1 + 0.2").result, "0.3");
  assert.equal(calculate("15% * 240").result, "36");
  assert.equal(calculate("2^100").result, "1267650600228229401496703205376");
  assert.equal(calculate("2^-3").result, "0.125");
});

test("calculator supports statistics, units, matrices, and complex numbers", () => {
  assert.equal(calculate("mean([2, 4, 8])").result, "4.6666666666666666666666666666667");
  assert.equal(calculate("12.7 cm to inch").result, "5 inch");
  assert.equal(calculate("det([[1,2],[3,4]])").result, "-2");
  assert.equal(calculate("complex(2, 3) * complex(1, -1)").result, "5 + i");
});

test("calculator accepts common expression aliases", () => {
  assert.equal(calculate("2**10").result, "1024");
  assert.equal(calculate("ln(e)").result, "1");
  assert.equal(calculate("var([1, 2, 3])").result, "1");
  assert.equal(calculate("stdev([1, 2, 3])").result, "1");
  assert.equal(calculate("comb(10, 3)").result, "120");
  assert.equal(calculate("72 F to C").result, "22.222222222222222222222222222222 degC");
});

test("calculator rejects state, unsafe functions, and excessive work", async () => {
  for (const expression of ["x = 2", "import({})", "2^10001"]) {
    const result = await executeCalculatorTool(calculatorDefinition, "Calculate", { expression });
    assert.equal(result?.isError, true, expression);
  }
});

test("calculator ignores unknown tool names", async () => {
  assert.equal(await executeCalculatorTool(calculatorDefinition, "Other", {}), null);
});
