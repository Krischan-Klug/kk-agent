import test from "node:test";
import assert from "node:assert/strict";
import {
  createTranscriptMessage,
  getMessageReasoning,
  getMessageText,
  getToolResults,
  getToolUses,
  hasVisibleAssistantContent,
  normalizeToolResultContent,
  reasoningBlock,
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

// --- getMessageText ---

test("getMessageText concatenates text blocks and ignores other block types", () => {
  const msg = { content: [textBlock("Hello "), reasoningBlock("thinking..."), textBlock("world")] };
  assert.equal(getMessageText(msg), "Hello world");
});

test("getMessageText returns empty string for message with no text blocks", () => {
  const msg = { content: [toolUseBlock("id", "Glob", {})] };
  assert.equal(getMessageText(msg), "");
});

test("getMessageText returns empty string for empty content", () => {
  assert.equal(getMessageText({ content: [] }), "");
});

// --- getMessageReasoning ---

test("getMessageReasoning concatenates reasoning blocks", () => {
  const msg = { content: [textBlock("visible"), reasoningBlock("step1"), reasoningBlock("step2")] };
  assert.equal(getMessageReasoning(msg), "step1step2");
});

test("getMessageReasoning returns empty string without reasoning blocks", () => {
  assert.equal(getMessageReasoning({ content: [textBlock("hello")] }), "");
});

// --- getToolUses ---

test("getToolUses extracts only tool_use blocks", () => {
  const tu1 = toolUseBlock("a", "Read", { path: "/x" });
  const tu2 = toolUseBlock("b", "Write", { path: "/y" });
  const msg = { content: [textBlock("text"), tu1, toolResultBlock("a", "ok"), tu2] };
  const uses = getToolUses(msg);
  assert.equal(uses.length, 2);
  assert.equal(uses[0].name, "Read");
  assert.equal(uses[1].name, "Write");
});

test("getToolUses returns empty array when no tool_use blocks exist", () => {
  assert.deepEqual(getToolUses({ content: [textBlock("hi")] }), []);
});

// --- getToolResults ---

test("getToolResults extracts only tool_result blocks", () => {
  const tr = toolResultBlock("call-1", "result text");
  const msg = { content: [textBlock("text"), tr] };
  const results = getToolResults(msg);
  assert.equal(results.length, 1);
  assert.equal(results[0].content, "result text");
});

// --- hasVisibleAssistantContent ---

test("hasVisibleAssistantContent returns true for non-empty text", () => {
  assert.equal(hasVisibleAssistantContent({ content: [textBlock("hello")] }), true);
});

test("hasVisibleAssistantContent returns true for tool_use blocks", () => {
  assert.equal(hasVisibleAssistantContent({ content: [toolUseBlock("id", "Glob", {})] }), true);
});

test("hasVisibleAssistantContent returns false for whitespace-only text", () => {
  assert.equal(hasVisibleAssistantContent({ content: [textBlock("  \n  ")] }), false);
});

test("hasVisibleAssistantContent returns false for empty content", () => {
  assert.equal(hasVisibleAssistantContent({ content: [] }), false);
});

test("hasVisibleAssistantContent returns false for reasoning-only content", () => {
  assert.equal(hasVisibleAssistantContent({ content: [reasoningBlock("thinking")] }), false);
});

// --- normalizeToolResultContent ---

test("normalizeToolResultContent returns content when non-empty", () => {
  assert.equal(normalizeToolResultContent("Bash", "output here"), "output here");
});

test("normalizeToolResultContent returns fallback for empty content", () => {
  assert.equal(normalizeToolResultContent("Bash", ""), "(Bash completed with no output)");
});

test("normalizeToolResultContent returns fallback for whitespace-only content", () => {
  assert.equal(normalizeToolResultContent("Glob", "   "), "(Glob completed with no output)");
});
