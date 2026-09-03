import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptMessage,
  reasoningBlock,
  textBlock,
  type ModelCompactionProfile,
} from "kk-agent-contract";
import type { UnifiedResponse } from "../../provider/lib/types.js";
import { COMPACTION_REQUIRED_HEADINGS } from "./context-compaction.js";
import { runContextCompaction, type CompactionPassRequest } from "./context-compaction-runner.js";

const profile: ModelCompactionProfile = {
  reasoningEffort: "none",
  maxOutputTokens: 8_000,
  inputBudgetRatio: 0.85,
};

function validSummary(label = "state"): string {
  const detail = `${label}: preserve verified decisions, assumptions, paths, errors, current work, and the next concrete action.`;
  return [
    COMPACTION_REQUIRED_HEADINGS[0],
    COMPACTION_REQUIRED_HEADINGS[1], `${detail} ${detail}`,
    COMPACTION_REQUIRED_HEADINGS[2], detail,
    COMPACTION_REQUIRED_HEADINGS[3], detail,
    COMPACTION_REQUIRED_HEADINGS[4], detail,
    COMPACTION_REQUIRED_HEADINGS[5], detail,
    COMPACTION_REQUIRED_HEADINGS[6], detail,
    COMPACTION_REQUIRED_HEADINGS[7], detail,
    COMPACTION_REQUIRED_HEADINGS[8], detail,
  ].join("\n\n");
}

function response(summary: string, finishReason: "stop" | "length" = "stop", reasoningTokens = 0): UnifiedResponse {
  return {
    message: createTranscriptMessage({
      role: "assistant",
      content: summary ? [textBlock(summary)] : [],
      stopReason: finishReason,
      usage: { inputTokens: 1_000, outputTokens: 500, reasoningTokens },
    }),
    finishReason,
    stats: { inputTokens: 1_000, outputTokens: 500, reasoningTokens, source: "provider" },
  };
}

test("oversized evidence falls back to bounded hierarchical compaction", async () => {
  const oldReasoning = `OLD_DECISION ${"x".repeat(80_000)}`;
  const recentReasoning = "RECENT_UNRESOLVED_ASSUMPTION";
  const requests: CompactionPassRequest[] = [];
  const result = await runContextCompaction({
    messages: [
      createTranscriptMessage({ role: "user", content: [textBlock("goal")] }),
      createTranscriptMessage({ role: "assistant", content: [reasoningBlock(oldReasoning)] }),
      createTranscriptMessage({ role: "tool", content: [textBlock("verified result")] }),
      createTranscriptMessage({ role: "assistant", content: [reasoningBlock(recentReasoning)] }),
      createTranscriptMessage({ role: "tool", content: [textBlock("latest result")] }),
    ],
    contextLimit: 32_000,
    profile,
    execute: async (request) => {
      requests.push(request);
      return { response: response(validSummary(request.stage)) };
    },
  });

  assert.ok(result.evidence.rawReasoningChars >= oldReasoning.length + recentReasoning.length);
  assert.ok(requests.some((request) => request.evidence.includes("OLD_DECISION")));
  assert.ok(requests.some((request) => request.evidence.includes("RECENT_UNRESOLVED_ASSUMPTION")));
  assert.ok(Math.max(...requests.map((request) => request.evidence.length)) < oldReasoning.length + 10_000);
});

test("a length-limited pass is split adaptively instead of repeating the same request", async () => {
  const requests: CompactionPassRequest[] = [];
  const result = await runContextCompaction({
    messages: [
      createTranscriptMessage({ role: "user", content: [textBlock("goal")] }),
      createTranscriptMessage({ role: "assistant", content: [reasoningBlock("z".repeat(70_000))] }),
      createTranscriptMessage({ role: "tool", content: [textBlock("result")] }),
      createTranscriptMessage({ role: "assistant", content: [reasoningBlock("current state")] }),
    ],
    contextLimit: 64_000,
    profile,
    execute: async (request) => {
      requests.push(request);
      return {
        response: request.evidence.length > 20_000
          ? response("", "length", 500)
          : response(validSummary(request.stage)),
      };
    },
  });

  assert.match(result.summary, /^# Continuation State/u);
  assert.ok(requests.some((request) => request.stage === "segment"));
  const requestSizes = requests.map((request) => request.evidence.length);
  assert.ok(new Set(requestSizes).size > 1);
});

test("evidence that fits the sub-session uses one final pass without segment compaction", async () => {
  const requests: CompactionPassRequest[] = [];
  const remainderMarker = "SMALL_HISTORICAL_REMAINDER";
  const result = await runContextCompaction({
    messages: [
      createTranscriptMessage({ role: "user", content: [textBlock("goal")] }),
      createTranscriptMessage({
        role: "assistant",
        content: [reasoningBlock(`${"a".repeat(29_000)}${remainderMarker}${"b".repeat(1_000)}`)],
      }),
      createTranscriptMessage({ role: "tool", content: [textBlock("historical result")] }),
      createTranscriptMessage({ role: "assistant", content: [reasoningBlock("current reasoning")] }),
      createTranscriptMessage({ role: "tool", content: [textBlock("latest result")] }),
    ],
    contextLimit: 40_192,
    profile,
    execute: async (request) => {
      requests.push(request);
      return { response: response(validSummary(request.stage)) };
    },
  });

  assert.match(result.summary, /^# Continuation State/u);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.stage, "final");
  assert.match(requests[0]?.evidence ?? "", new RegExp(remainderMarker));
});
