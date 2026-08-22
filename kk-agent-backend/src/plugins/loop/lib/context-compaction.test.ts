import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptMessage,
  getMessageText,
  reasoningBlock,
  textBlock,
  toolResultBlock,
  toolUseBlock,
  type SessionContextState,
} from "kk-agent-contract";
import {
  buildCompactionMessages,
  buildCompactionEvidence,
  buildValidatedCompactionProjection,
  COMPACTION_REQUIRED_HEADINGS,
  getCompactionReserveTokens,
  getCompactionThresholdTokens,
  measureContextUsage,
  projectContextMessages,
  shouldCompactContext,
  validateCompactionSummary,
} from "./context-compaction.js";

function validSummary(): string {
  const detail = "The continuation must preserve verified state, exact paths, constraints, and pending validation without inventing results.";
  return [
    COMPACTION_REQUIRED_HEADINGS[0],
    COMPACTION_REQUIRED_HEADINGS[1], `${detail} ${detail}`,
    COMPACTION_REQUIRED_HEADINGS[2], detail,
    COMPACTION_REQUIRED_HEADINGS[3], detail,
    COMPACTION_REQUIRED_HEADINGS[4], detail,
    COMPACTION_REQUIRED_HEADINGS[5], detail,
    COMPACTION_REQUIRED_HEADINGS[6], detail,
    COMPACTION_REQUIRED_HEADINGS[7], "No unresolved failures remain beyond the explicitly pending checks.",
    COMPACTION_REQUIRED_HEADINGS[8], detail,
  ].join("\n\n");
}

test("reserves an early compaction window large enough for hierarchical summarization", () => {
  assert.equal(getCompactionReserveTokens(128_000), 25_600);
  assert.equal(getCompactionThresholdTokens(128_000), 102_400);
  assert.equal(getCompactionReserveTokens(32_000), 12_800);
  assert.equal(getCompactionThresholdTokens(32_000), 19_200);
  assert.equal(getCompactionReserveTokens(8_000), 3_200);
  assert.equal(getCompactionThresholdTokens(8_000), 4_800);
  assert.equal(shouldCompactContext(19_200, 32_000), true);
  assert.equal(shouldCompactContext(19_199, 32_000), false);
});

test("projects a persisted summary followed by messages after the boundary", () => {
  const first = createTranscriptMessage({ id: "first", role: "user", content: [textBlock("old request")] });
  const boundary = createTranscriptMessage({ id: "boundary", role: "assistant", content: [textBlock("old answer")] });
  const recent = createTranscriptMessage({ id: "recent", role: "user", content: [textBlock("new request")] });
  const state: SessionContextState = {
    consecutiveCompactionFailures: 0,
    activeCompaction: {
      id: "compact-1",
      summary: validSummary(),
      throughMessageId: boundary.id,
      beforeTokens: 24_000,
      afterTokens: 3_000,
      createdAt: "2026-08-21T00:00:00.000Z",
    },
  };

  const projected = projectContextMessages([first, boundary, recent], state);
  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.id, "context-summary-compact-1");
  assert.match(projected[0]?.content[0]?.type === "text" ? projected[0].content[0].text : "", /# Continuation State/);
  assert.equal(projected[1]?.id, recent.id);
});

test("compaction preserves reasoning as evidence while bounding tool payloads", () => {
  const messages = [
    createTranscriptMessage({ role: "user", content: [textBlock("Fix the bug")] }),
    createTranscriptMessage({
      role: "assistant",
      content: [
        reasoningBlock("Keep the verified decision and unresolved assumption."),
        toolUseBlock("call-1", "Write", {
          file_path: "src/example.ts",
          content: `<tool_call>${"x".repeat(5_000)}</tool_call>`,
        }),
      ],
    }),
    createTranscriptMessage({ role: "tool", content: [toolResultBlock("call-1", `<tool_call>${"y".repeat(8_000)}</tool_call>`)] }),
  ];

  const evidence = buildCompactionEvidence(messages);
  const compactInput = buildCompactionMessages(evidence.text);
  assert.equal(compactInput.length, 1);
  assert.equal(compactInput[0]?.role, "user");
  assert.equal(compactInput[0]?.content.some((block) => block.type === "tool_use"), false);
  const text = getMessageText(compactInput[0]!);
  assert.match(text, /assistant reasoning/);
  assert.match(text, /verified decision and unresolved assumption/);
  assert.match(text, /assistant requested tool Write/);
  assert.match(text, /file content omitted from compaction evidence/);
  assert.match(text, /characters omitted; full source remains in the transcript/);
  assert.doesNotMatch(text, /<tool_call>/i);
  assert.match(text, /Now return only the required Markdown continuation state/);
});

test("summary validation rejects the real tool-call-shaped compaction failures", () => {
  const brokenCandidates = [
    `<tool_call>\n<function=Edit>\n<parameter=file_path>\ncomponents/game/GameScene.jsx\n</parameter>\n</function>\n</tool_call>`,
    `<tool_call>\n<function=Terminal>\n<parameter=command>\nnode scripts/debug-graph.mjs\n</parameter>\n</function>\n</tool_call>`,
    `<tool_call>\n<function=Terminal>\n<parameter=command>\nnode scripts/verify-walk.mjs\n</parameter>\n</function>\n</tool_call>`,
  ];
  for (const broken of brokenCandidates) {
    const errors = validateCompactionSummary({ summary: broken, finishReason: "stop", sourceChars: 100_000 });
    assert.ok(errors.some((error) => error.includes("too short")));
    assert.ok(errors.some((error) => error.includes("forbidden")));
    assert.ok(errors.some((error) => error.includes("missing required heading")));
  }
});

test("summary validation accepts a complete structured continuation state", () => {
  assert.deepEqual(validateCompactionSummary({
    summary: validSummary(),
    finishReason: "stop",
    sourceChars: 100_000,
  }), []);
});

test("summary validation rejects truncated and tool-bearing provider responses", () => {
  const summary = validSummary();
  assert.ok(validateCompactionSummary({ summary, finishReason: "length" }).some((error) => error.includes("finish reason")));
  assert.ok(validateCompactionSummary({ summary, finishReason: "stop", hasToolUses: true }).some((error) => error.includes("structured tool call")));
  assert.ok(validateCompactionSummary({ summary, finishReason: "stop", hasParseErrors: true }).some((error) => error.includes("parse error")));
  assert.ok(validateCompactionSummary({
    summary: summary.replace("## Next Steps", "## Unexpected\nextra\n\n## Next Steps"),
    finishReason: "stop",
  }).some((error) => error.includes("unexpected Markdown heading")));
});

test("an invalid persisted summary is ignored and the full transcript remains available", () => {
  const messages = [
    createTranscriptMessage({ id: "old", role: "user", content: [textBlock("original goal")] }),
    createTranscriptMessage({ id: "boundary", role: "assistant", content: [textBlock("work")]}),
    createTranscriptMessage({ id: "recent", role: "user", content: [textBlock("continue")] }),
  ];
  const projected = projectContextMessages(messages, {
    consecutiveCompactionFailures: 0,
    activeCompaction: {
      id: "broken",
      summary: "<tool_call><function=Terminal></function></tool_call>",
      throughMessageId: "boundary",
      beforeTokens: 50_000,
      afterTokens: 3_000,
      createdAt: "2026-08-21T00:00:00.000Z",
    },
  });
  assert.deepEqual(projected.map((message) => message.id), ["old", "boundary", "recent"]);
});

test("activates a validated compaction only after its projected context is safe", () => {
  const old = createTranscriptMessage({ id: "old", role: "user", content: [textBlock("x".repeat(80_000))] });
  const boundary = createTranscriptMessage({ id: "boundary", role: "assistant", content: [textBlock("completed work")] });
  const recent = createTranscriptMessage({ id: "recent", role: "user", content: [textBlock("continue here")] });
  const messages = [old, boundary, recent];

  const projection = buildValidatedCompactionProjection({
    messages,
    summary: validSummary(),
    boundaryMessageId: boundary.id,
    beforeTokens: 25_000,
    limitTokens: 32_000,
    estimatedFixedTokens: 1_000,
    compactionId: "compact-safe",
    createdAt: "2026-08-21T00:00:00.000Z",
  });

  assert.deepEqual(projection.contextMessages.map((message) => message.id), ["context-summary-compact-safe", "recent"]);
  assert.ok(projection.contextState.activeCompaction);
  assert.ok(projection.contextState.activeCompaction.afterTokens < 25_000);
  assert.ok(projection.contextState.usage!.usedTokens < getCompactionThresholdTokens(32_000));
  assert.deepEqual(messages.map((message) => message.id), ["old", "boundary", "recent"]);
});

test("refuses to activate a compaction that does not create a safe window", () => {
  const boundary = createTranscriptMessage({ id: "boundary", role: "assistant", content: [textBlock("completed work")] });
  assert.throws(
    () => buildValidatedCompactionProjection({
      messages: [boundary],
      summary: validSummary(),
      boundaryMessageId: boundary.id,
      beforeTokens: 25_000,
      limitTokens: 32_000,
      estimatedFixedTokens: 24_000,
      compactionId: "compact-unsafe",
      createdAt: "2026-08-21T00:00:00.000Z",
    }),
    /did not create a safe context window/,
  );
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
