import test from "node:test";
import assert from "node:assert/strict";
import { createTranscriptMessage, textBlock, toolResultBlock } from "../../../lib/transcript.js";
import type { UnifiedRequest } from "../types.js";
import { commitResponsesTransportState, prepareResponsesRequest } from "./responses.js";

function buildRequest(overrides: Partial<UnifiedRequest> = {}): UnifiedRequest {
  return {
    model: "test-model",
    endpoint: "responses",
    transportProfile: {
      supported: true,
      reasoningTransport: "responses-effort",
      toolSchemaTransport: "responses-tools",
      streamGrammar: "openai-responses",
      toolCallAssemblyMode: "responses-output-state",
      supportsParallelToolCalls: true,
      supportsConcatenatedJsonSplit: true,
      continuationMode: "raw-output-replay",
      supportsPreviousResponseId: false,
      supportsConversations: false,
      supportsStrictTools: false,
    },
    messages: [],
    ...overrides,
  };
}

test("prepareResponsesRequest moves system prompt into instructions and keeps only native input items", () => {
  const prepared = prepareResponsesRequest(buildRequest({
    messages: [
      createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] }),
      createTranscriptMessage({ role: "user", content: [textBlock("USER")] }),
    ],
  }));

  assert.equal(prepared.body.instructions, "SYSTEM");
  assert.deepEqual(prepared.body.input, [{ type: "message", role: "user", content: "USER" }]);
  assert.equal(prepared.transportState.historyItems.length, 1);
});

test("responses follow-up replays raw output items and appends function_call_output", () => {
  const systemMessage = createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] });
  const userMessage = createTranscriptMessage({ role: "user", content: [textBlock("USER")] });
  const initial = prepareResponsesRequest(buildRequest({
    messages: [systemMessage, userMessage],
  }));

  const nextState = commitResponsesTransportState({
    transportState: initial.transportState,
    assistantMessageId: "assistant-1",
    output: [
      {
        type: "message",
        id: "msg_output_1",
        role: "assistant",
        content: [{ type: "output_text", text: "Ich prüfe das Repo." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "list_directory",
        arguments: "{\"path\":\"C:\\\\repo\"}",
      },
    ],
    responseId: "resp_1",
  });

  const prepared = prepareResponsesRequest(buildRequest({
    messages: [
      systemMessage,
      userMessage,
      createTranscriptMessage({ role: "assistant", id: "assistant-1", content: [] }),
      createTranscriptMessage({
        role: "tool",
        content: [toolResultBlock("call_1", "[dir] src/")],
      }),
    ],
    transportState: nextState,
  }));

  assert.deepEqual(prepared.body.input, [
    { type: "message", role: "user", content: "USER" },
    {
      type: "message",
      id: "msg_output_1",
      role: "assistant",
      content: [{ type: "output_text", text: "Ich prüfe das Repo." }],
    },
    {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "list_directory",
      arguments: "{\"path\":\"C:\\\\repo\"}",
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "[dir] src/",
    },
  ]);
});

test("commitResponsesTransportState keeps call_id mapping for later tool outputs", () => {
  const state = commitResponsesTransportState({
    transportState: {
      endpoint: "responses",
      continuationMode: "raw-output-replay",
      syncedMessageIds: [],
      historyItems: [],
      callIdByToolUseId: {},
    },
    assistantMessageId: "assistant-2",
    output: [{
      type: "function_call",
      id: "fc_2",
      call_id: "call_2",
      name: "grep",
      arguments: "{\"pattern\":\"TODO\"}",
    }],
  });

  assert.equal(state.callIdByToolUseId.call_2, "call_2");
  assert.equal(state.syncedMessageIds[0], "assistant-2");
});
