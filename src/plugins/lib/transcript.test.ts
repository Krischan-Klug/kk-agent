import test from "node:test";
import assert from "node:assert/strict";
import {
  createTranscriptMessage,
  repairTranscript,
  textBlock,
  toolResultBlock,
  toolUseBlock,
} from "./transcript.js";

test("repairTranscript removes duplicate tool uses/results and inserts missing synthetic results", () => {
  const repaired = repairTranscript([
    createTranscriptMessage({
      role: "assistant",
      id: "assistant-1",
      content: [
        toolUseBlock("call-1", "Glob", { pattern: "**/*.ts" }),
        toolUseBlock("call-1", "Glob", { pattern: "**/*.ts" }),
        toolUseBlock("call-2", "Grep", { pattern: "TODO" }),
      ],
    }),
    createTranscriptMessage({
      role: "tool",
      id: "tool-1",
      content: [
        toolResultBlock("call-1", "first"),
        toolResultBlock("call-1", "duplicate"),
      ],
    }),
  ]);

  const assistant = repaired[0]!;
  const firstTool = repaired[1]!;

  assert.equal(assistant.content.filter((block) => block.type === "tool_use").length, 2);
  assert.equal(firstTool.role, "tool");
  assert.equal(firstTool.content.filter((block) => block.type === "tool_result").length, 2);
  const syntheticBlock = firstTool.content[0];
  const firstRealBlock = firstTool.content[1];
  assert.ok(syntheticBlock && syntheticBlock.type === "tool_result");
  assert.equal(syntheticBlock?.tool_use_id, "call-2");
  assert.equal(syntheticBlock?.is_error, true);
  assert.ok(firstRealBlock && firstRealBlock.type === "tool_result");
  assert.equal(firstRealBlock?.tool_use_id, "call-1");
});

test("repairTranscript strips orphaned tool results and stabilizes empty assistant turns", () => {
  const repaired = repairTranscript([
    createTranscriptMessage({
      role: "tool",
      id: "orphan-tool",
      content: [toolResultBlock("missing", "orphan")],
    }),
    createTranscriptMessage({
      role: "assistant",
      id: "assistant-empty",
      content: [],
    }),
    createTranscriptMessage({
      role: "user",
      id: "user-1",
      content: [textBlock("hello")],
    }),
  ]);

  assert.equal(repaired.length, 2);
  assert.equal(repaired[0]?.role, "assistant");
  const placeholder = repaired[0]?.content[0];
  assert.ok(placeholder && placeholder.type === "text");
  assert.equal(placeholder?.text.includes("no visible content"), true);
});
