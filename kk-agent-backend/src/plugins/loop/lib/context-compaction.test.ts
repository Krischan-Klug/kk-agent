import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptMessage,
  textBlock,
  type SessionContextState,
} from "kk-agent-contract";
import {
  getCompactionReserveTokens,
  getCompactionMaxOutputTokens,
  getCompactionThresholdTokens,
  measureContextUsage,
  projectContextMessages,
  shouldCompactContext,
} from "./context-compaction.js";

test("reserves ten percent or 8k tokens without consuming small context windows", () => {
  assert.equal(getCompactionReserveTokens(128_000), 12_800);
  assert.equal(getCompactionThresholdTokens(128_000), 115_200);
  assert.equal(getCompactionReserveTokens(32_000), 8_000);
  assert.equal(getCompactionThresholdTokens(32_000), 24_000);
  assert.equal(getCompactionMaxOutputTokens(32_000), 4_000);
  assert.equal(getCompactionMaxOutputTokens(128_000), 6_000);
  assert.equal(getCompactionReserveTokens(8_000), 2_000);
  assert.equal(getCompactionThresholdTokens(8_000), 6_000);
  assert.equal(shouldCompactContext(24_000, 32_000), true);
  assert.equal(shouldCompactContext(23_999, 32_000), false);
});

test("projects a persisted summary followed by messages after the boundary", () => {
  const first = createTranscriptMessage({ id: "first", role: "user", content: [textBlock("old request")] });
  const boundary = createTranscriptMessage({ id: "boundary", role: "assistant", content: [textBlock("old answer")] });
  const recent = createTranscriptMessage({ id: "recent", role: "user", content: [textBlock("new request")] });
  const state: SessionContextState = {
    consecutiveCompactionFailures: 0,
    activeCompaction: {
      id: "compact-1",
      summary: "Preserved working state",
      throughMessageId: boundary.id,
      beforeTokens: 24_000,
      afterTokens: 3_000,
      createdAt: "2026-08-21T00:00:00.000Z",
    },
  };

  const projected = projectContextMessages([first, boundary, recent], state);
  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.id, "context-summary-compact-1");
  assert.match(projected[0]?.content[0]?.type === "text" ? projected[0].content[0].text : "", /Preserved working state/);
  assert.equal(projected[1]?.id, recent.id);
});

test("uses provider usage as the canonical next-window baseline", () => {
  const assistant = createTranscriptMessage({
    id: "assistant",
    role: "assistant",
    content: [textBlock("answer")],
    usage: { inputTokens: 10_000, outputTokens: 2_000, reasoningTokens: 500 },
  });
  const nextUser = createTranscriptMessage({
    id: "next-user",
    role: "user",
    content: [textBlock("x".repeat(400))],
  });

  const usage = measureContextUsage({ messages: [assistant, nextUser], limitTokens: 32_000 });
  assert.equal(usage.source, "provider");
  assert.equal(usage.inputTokens, 10_000);
  assert.equal(usage.outputTokens, 2_000);
  assert.ok(usage.usedTokens > 12_000);
  assert.equal(usage.remainingTokens, 32_000 - usage.usedTokens);
});

test("falls back to a fixed-input plus transcript estimate before provider usage exists", () => {
  const message = createTranscriptMessage({ role: "user", content: [textBlock("x".repeat(400))] });
  const usage = measureContextUsage({
    messages: [message],
    limitTokens: 32_000,
    estimatedFixedTokens: 1_000,
  });
  assert.equal(usage.source, "estimated");
  assert.ok(usage.usedTokens >= 1_100);
  assert.equal(usage.inputTokens, usage.usedTokens);
});
