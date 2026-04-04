import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeChatCompletionsTurn,
  finalizeResponsesOutput,
  handleResponsesStreamingEvent,
  splitConcatenatedJson,
} from "./transport.js";

test("splitConcatenatedJson separates back-to-back objects", () => {
  assert.deepEqual(
    splitConcatenatedJson('{"query":"A"}{"query":"B"}'),
    ['{"query":"A"}', '{"query":"B"}'],
  );
});

test("finalizeChatCompletionsTurn keeps valid calls and quarantines malformed ones", () => {
  const turn = finalizeChatCompletionsTurn({
    messageId: "msg-1",
    text: "",
    reasoning: "",
    rawToolCalls: [
      { id: "call-1", name: "list_directory", rawArguments: '{"path":"C:\\\\repo"}', index: 0 },
      { id: "call-2", name: "list_directory", rawArguments: '{"path":"C:\\\\repo"', index: 1 },
      { id: "call-3", name: "list_to_dir", rawArguments: '{"path":"C:\\\\repo"}', index: 2 },
    ],
    finishReason: "stop",
    tools: [{ name: "list_directory", description: "", parameters: {} }],
    supportsConcatenatedJsonSplit: true,
  });

  assert.equal(turn.finishReason, "tool_use");
  assert.equal(turn.toolCalls.length, 1);
  assert.equal(turn.toolCalls[0]?.name, "list_directory");
  assert.equal(turn.parseIssues.length, 2);
  assert.ok(turn.parseIssues.some((issue) => issue.code === "incomplete_arguments"));
  assert.ok(turn.parseIssues.some((issue) => issue.code === "unknown_tool_name"));
});

test("finalizeResponsesOutput splits concatenated function call arguments", () => {
  const turn = finalizeResponsesOutput({
    messageId: "msg-2",
    output: [
      {
        type: "function_call",
        id: "call-1",
        name: "search_files",
        arguments: '{"pattern":"src"}{"pattern":"tests"}',
      },
    ],
    tools: [{ name: "search_files", description: "", parameters: {} }],
    supportsConcatenatedJsonSplit: true,
  });

  assert.equal(turn.toolCalls.length, 2);
  assert.ok(turn.parseIssues.some((issue) => issue.code === "split_arguments"));
});

test("finalizeChatCompletionsTurn collapses duplicate valid tool calls in one turn", () => {
  const turn = finalizeChatCompletionsTurn({
    messageId: "msg-dup",
    text: "",
    reasoning: "",
    rawToolCalls: [
      { id: "call-1", name: "list_directory", rawArguments: '{"path":"C:\\\\repo"}', index: 0 },
      { id: "call-2", name: "list_directory", rawArguments: '{"path":"C:\\\\repo"}', index: 1 },
    ],
    finishReason: "length",
    tools: [{ name: "list_directory", description: "", parameters: {} }],
    supportsConcatenatedJsonSplit: true,
  });

  assert.equal(turn.toolCalls.length, 1);
  assert.ok(turn.parseIssues.some((issue) => issue.code === "duplicate_call_collapsed"));
});

test("handleResponsesStreamingEvent assembles interleaved response output", () => {
  let output: Array<Record<string, unknown> & { type: string }> = [];

  output = handleResponsesStreamingEvent({
    type: "response.output_item.added",
    item: { type: "message", content: [] },
  }, output).output;
  output = handleResponsesStreamingEvent({
    type: "response.output_text.delta",
    output_index: 0,
    content_index: 0,
    delta: "Hallo",
  }, output).output;
  output = handleResponsesStreamingEvent({
    type: "response.output_item.added",
    item: { type: "function_call", id: "call-1", name: "grep", arguments: "" },
  }, output).output;
  output = handleResponsesStreamingEvent({
    type: "response.function_call_arguments.delta",
    output_index: 1,
    delta: '{"pattern":"TODO"}',
  }, output).output;

  const turn = finalizeResponsesOutput({
    messageId: "msg-3",
    output,
    tools: [{ name: "grep", description: "", parameters: {} }],
    supportsConcatenatedJsonSplit: true,
  });

  assert.equal(turn.text, "Hallo");
  assert.equal(turn.toolCalls.length, 1);
  assert.deepEqual(turn.toolCalls[0]?.arguments, { pattern: "TODO" });
});
