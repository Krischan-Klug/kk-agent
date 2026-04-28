import type { TokenStats } from "../../provider/lib/types.js";

interface TokenBudgetConfig {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  continuationThreshold?: number; // 0..1
  diminishingReturnsTurns?: number;
  diminishingReturnsTokens?: number;
}

interface TokenBudgetState {
  usedInput: number;
  usedOutput: number;
  recentOutputDeltas: number[];
  maxInputTokens: number;
  maxOutputTokens: number;
  continuationThreshold: number;
  diminishingReturnsTurns: number;
  diminishingReturnsTokens: number;
}

type ShouldContinueReason =
  | "under_budget"
  | "input_exhausted"
  | "output_exhausted"
  | "diminishing_returns";

export function createTokenBudget(config: TokenBudgetConfig = {}): TokenBudgetState {
  return {
    usedInput: 0,
    usedOutput: 0,
    recentOutputDeltas: [],
    maxInputTokens: config.maxInputTokens ?? 200_000,
    maxOutputTokens: config.maxOutputTokens ?? 200_000,
    continuationThreshold: config.continuationThreshold ?? 0.9,
    diminishingReturnsTurns: config.diminishingReturnsTurns ?? 3,
    diminishingReturnsTokens: config.diminishingReturnsTokens ?? 500,
  };
}

export function recordTurn(state: TokenBudgetState, stats: TokenStats): void {
  const deltaOutput = Math.max(0, stats.outputTokens);
  state.usedInput = Math.max(state.usedInput, stats.inputTokens);
  state.usedOutput += deltaOutput;
  state.recentOutputDeltas.push(deltaOutput);
  if (state.recentOutputDeltas.length > state.diminishingReturnsTurns) {
    state.recentOutputDeltas.shift();
  }
}

export function shouldContinue(state: TokenBudgetState): {
  continue: boolean;
  reason: ShouldContinueReason;
} {
  if (state.usedInput >= state.maxInputTokens * state.continuationThreshold) {
    return { continue: false, reason: "input_exhausted" };
  }
  if (state.usedOutput >= state.maxOutputTokens * state.continuationThreshold) {
    return { continue: false, reason: "output_exhausted" };
  }
  if (state.recentOutputDeltas.length >= state.diminishingReturnsTurns) {
    const allSmall = state.recentOutputDeltas.every(
      (delta) => delta < state.diminishingReturnsTokens,
    );
    if (allSmall) return { continue: false, reason: "diminishing_returns" };
  }
  return { continue: true, reason: "under_budget" };
}
