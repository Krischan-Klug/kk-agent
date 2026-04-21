import test from "node:test";
import assert from "node:assert/strict";
import { createTranscriptMessage, textBlock, toolResultBlock } from "../../../lib/transcript.js";
import type { UnifiedRequest } from "../types.js";
import { chat, commitResponsesTransportState, prepareResponsesRequest } from "./responses.js";

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
      supportsConcatenatedJsonSplit: true,
      continuationMode: "previous-response-id",
      supportsStrictTools: false,
    },
    messages: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  } as Response;
}

test("prepareResponsesRequest moves system prompt into instructions and starts stateless before a response id exists", () => {
  const prepared = prepareResponsesRequest(buildRequest({
    messages: [
      createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] }),
      createTranscriptMessage({ role: "user", content: [textBlock("USER")] }),
    ],
  }));

  assert.equal(prepared.body.instructions, "SYSTEM");
  assert.deepEqual(prepared.body.input, [{ type: "message", role: "user", content: "USER" }]);
  assert.equal(prepared.continuationMode, "raw-output-replay");
  assert.equal(prepared.transportState.historyItems.length, 1);
});

test("responses follow-up uses previous_response_id and sends only new unsynced input items", () => {
  const systemMessage = createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] });
  const userMessage = createTranscriptMessage({ role: "user", content: [textBlock("USER")] });
  const initial = prepareResponsesRequest(buildRequest({
    messages: [systemMessage, userMessage],
  }));

  const nextState = commitResponsesTransportState({
    transportState: initial.transportState,
    assistantMessageId: "assistant-1",
    responseId: "resp_1",
    output: [
      {
        type: "message",
        id: "msg_output_1",
        role: "assistant",
        content: [{ type: "output_text", text: "Ich pruefe das Repo." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "Read",
        arguments: "{\"file_path\":\"C:\\\\repo\\\\README.md\"}",
      },
    ],
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

  assert.equal(prepared.continuationMode, "previous-response-id");
  assert.equal(prepared.body.previous_response_id, "resp_1");
  assert.deepEqual(prepared.body.input, [
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "[dir] src/",
    },
  ]);
});

test("prepareResponsesRequest merges additional request json while keeping first-class fields authoritative", () => {
  const prepared = prepareResponsesRequest(buildRequest({
    messages: [
      createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] }),
      createTranscriptMessage({ role: "user", content: [textBlock("USER")] }),
    ],
    resolvedLlmRequestConfig: {
      common: {
        endpoint: "responses",
        reasoningEffort: "high",
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
      extraBody: {
        reasoning: {
          effort: "low",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
        temperature: 0.1,
        max_output_tokens: 32,
      },
      omittedUnsupportedKeys: [],
    },
  }));

  assert.deepEqual(prepared.body.reasoning, {
    effort: "high",
    summary: "concise",
  });
  assert.deepEqual(prepared.body.text, {
    verbosity: "low",
  });
  assert.equal(prepared.body.temperature, 0.7);
  assert.equal(prepared.body.max_output_tokens, 4096);
});

test("commitResponsesTransportState keeps call_id mapping and the last response id", () => {
  const state = commitResponsesTransportState({
    transportState: {
      endpoint: "responses",
      continuationMode: "raw-output-replay",
      syncedMessageIds: [],
      historyItems: [],
      callIdByToolUseId: {},
      lastResponseId: undefined,
    },
    assistantMessageId: "assistant-2",
    responseId: "resp_2",
    output: [{
      type: "function_call",
      id: "fc_2",
      call_id: "call_2",
      name: "Grep",
      arguments: "{\"pattern\":\"TODO\"}",
    }],
  });

  assert.equal(state.callIdByToolUseId.call_2, "call_2");
  assert.equal(state.syncedMessageIds[0], "assistant-2");
  assert.equal(state.lastResponseId, "resp_2");
});

test("chat falls back from previous_response_id to raw replay exactly once when the server rejects stateful continuation", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];

  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    if (body.previous_response_id) {
      return {
        ok: false,
        status: 400,
        async text() {
          return "previous_response_id is unsupported";
        },
      } as Response;
    }
    return jsonResponse({
      id: "resp_2",
      output: [{
        type: "message",
        id: "msg_output_2",
        role: "assistant",
        content: [{ type: "output_text", text: "fallback ok" }],
      }],
    });
  }) as typeof fetch;

  try {
    const userMessage = createTranscriptMessage({ role: "user", id: "user-1", content: [textBlock("USER")] });
    const assistantMessage = createTranscriptMessage({ role: "assistant", id: "assistant-1", content: [] });
    const toolMessage = createTranscriptMessage({ role: "tool", content: [toolResultBlock("call_1", "[dir] src/")] });
    const response = await chat(buildRequest({
      messages: [
        createTranscriptMessage({ role: "system", content: [textBlock("SYSTEM")] }),
        userMessage,
        assistantMessage,
        toolMessage,
      ],
      transportState: {
        endpoint: "responses",
        continuationMode: "previous-response-id",
        syncedMessageIds: ["user-1", "assistant-1"],
        historyItems: [
          { type: "message", role: "user", content: "USER" },
          { type: "function_call", id: "fc_1", call_id: "call_1", name: "Read", arguments: "{}" },
        ],
        callIdByToolUseId: { call_1: "call_1" },
        lastResponseId: "resp_1",
      },
    }), "http://provider.test");

    assert.equal(bodies.length, 2);
    assert.equal(bodies[0]?.previous_response_id, "resp_1");
    assert.equal(bodies[1]?.previous_response_id, undefined);
    assert.deepEqual(bodies[1]?.input, [
      { type: "message", role: "user", content: "USER" },
      { type: "function_call", id: "fc_1", call_id: "call_1", name: "Read", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: "[dir] src/" },
    ]);
    assert.equal(response.debug?.continuationMode, "raw-output-replay");
    assert.equal(response.debug?.continuationFallback?.from, "previous-response-id");
    assert.equal(response.debug?.continuationFallback?.to, "raw-output-replay");
    assert.equal(response.notices?.[0]?.code, "response_statefulness_fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
