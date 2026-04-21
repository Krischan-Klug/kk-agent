import test from "node:test";
import assert from "node:assert/strict";
import { snipOldestToolCycles, estimateTranscriptChars } from "./recovery.js";
import { createTranscriptMessage, textBlock } from "../../lib/transcript.js";
import type { TranscriptMessage } from "../../lib/transcript.js";

function msg(role: "user" | "assistant", text: string): TranscriptMessage {
  return createTranscriptMessage({ role, content: [textBlock(text)] });
}

test("snipOldestToolCycles preserves first message and last pair", () => {
  const messages: TranscriptMessage[] = [
    msg("user", "Initial task"),
    msg("assistant", "a".repeat(2000)),
    msg("user", "b".repeat(2000)),
    msg("assistant", "c".repeat(2000)),
    msg("user", "d".repeat(2000)),
    msg("assistant", "final"),
    msg("user", "still here"),
  ];
  const before = estimateTranscriptChars(messages);
  const { messages: out, removed } = snipOldestToolCycles(messages, Math.floor(before / 2));
  assert.equal(out[0].content?.[0]?.type, "text");
  assert.ok(removed > 0);
  assert.ok(estimateTranscriptChars(out) < before);
  // First message still present
  assert.equal((out[0].content?.[0] as any).text, "Initial task");
  // Last two messages still present
  assert.equal((out[out.length - 1].content?.[0] as any).text, "still here");
});

test("snipOldestToolCycles is a no-op when under budget", () => {
  const messages: TranscriptMessage[] = [msg("user", "hi"), msg("assistant", "hey"), msg("user", "ok")];
  const { messages: out, removed } = snipOldestToolCycles(messages, 100_000);
  assert.equal(removed, 0);
  assert.equal(out.length, messages.length);
});

test("snipOldestToolCycles keeps minimum transcript on extreme target", () => {
  const messages: TranscriptMessage[] = Array.from({ length: 10 }, (_, i) =>
    msg(i % 2 === 0 ? "user" : "assistant", "x".repeat(500)),
  );
  const { messages: out } = snipOldestToolCycles(messages, 10);
  assert.ok(out.length >= 3);
});
