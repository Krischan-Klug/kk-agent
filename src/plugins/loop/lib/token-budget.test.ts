import test from "node:test";
import assert from "node:assert/strict";
import { createTokenBudget, recordTurn, shouldContinue } from "./token-budget.js";

function stats(input: number, output: number) {
  return { inputTokens: input, outputTokens: output, reasoningTokens: 0, source: "provider" as const };
}

test("shouldContinue returns under_budget when fresh", () => {
  const budget = createTokenBudget({ maxInputTokens: 1000, maxOutputTokens: 1000 });
  assert.deepEqual(shouldContinue(budget), { continue: true, reason: "under_budget" });
});

test("shouldContinue flags input exhaustion", () => {
  const budget = createTokenBudget({ maxInputTokens: 1000, maxOutputTokens: 1000 });
  recordTurn(budget, stats(950, 50));
  const v = shouldContinue(budget);
  assert.equal(v.continue, false);
  assert.equal(v.reason, "input_exhausted");
});

test("shouldContinue flags output exhaustion", () => {
  const budget = createTokenBudget({ maxInputTokens: 10_000, maxOutputTokens: 1000 });
  recordTurn(budget, stats(100, 600));
  recordTurn(budget, stats(200, 400));
  const v = shouldContinue(budget);
  assert.equal(v.continue, false);
  assert.equal(v.reason, "output_exhausted");
});

test("shouldContinue flags diminishing returns", () => {
  const budget = createTokenBudget({
    maxInputTokens: 1_000_000,
    maxOutputTokens: 1_000_000,
    diminishingReturnsTurns: 3,
    diminishingReturnsTokens: 500,
  });
  recordTurn(budget, stats(100, 20));
  recordTurn(budget, stats(100, 30));
  recordTurn(budget, stats(100, 40));
  const v = shouldContinue(budget);
  assert.equal(v.continue, false);
  assert.equal(v.reason, "diminishing_returns");
});

test("shouldContinue resets diminishing when a big turn happens", () => {
  const budget = createTokenBudget({
    maxInputTokens: 1_000_000,
    maxOutputTokens: 1_000_000,
    diminishingReturnsTurns: 3,
    diminishingReturnsTokens: 500,
  });
  recordTurn(budget, stats(100, 20));
  recordTurn(budget, stats(100, 20));
  recordTurn(budget, stats(100, 2000));
  const v = shouldContinue(budget);
  assert.equal(v.continue, true);
});
