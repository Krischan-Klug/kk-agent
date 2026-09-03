import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptMessage,
  getMessageReasoning,
  getMessageText,
  getToolUses,
  textBlock,
} from "kk-agent-contract";
import { getModelProfile } from "../model-profiles/registry.js";
import type { ModelProfile } from "../model-profiles/types.js";
import type { PreparedProviderRequest } from "../types.js";
import { complete as chatCompletions } from "./chat-completions.js";
import { complete as responses } from "./responses.js";

function preparedRequest(
  profile: ModelProfile,
  overrides: Partial<PreparedProviderRequest> = {},
): PreparedProviderRequest {
  return {
    providerId: "provider-a",
    model: "model-a",
    endpoint: profile.endpoint,
    instructions: "system",
    messages: [],
    transportProfile: profile.transport,
    providerRequestBody: {},
    resolvedLlmRequestConfig: {
      endpoint: profile.endpoint,
      profileId: profile.id,
      reasoning: {
        requestedHistory: "auto",
        effectiveHistory: "discard",
        enabled: false,
      },
      sampling: {},
      warnings: [],
    },
    ...overrides,
  };
}

function streamResponse(events: Array<Record<string, unknown>>): Response {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

test("Chat Completions streams reasoning, text, fragmented tools, usage, and generic wire options", async () => {
  const profile = getModelProfile("qwen/qwen3.8-27b");
  assert.ok(profile);
  const originalFetch = globalThis.fetch;
  let sentBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return streamResponse([
      { choices: [{ delta: { reasoning_content: "think " } }] },
      { choices: [{ delta: { content: "answer" } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Read", arguments: "{\"path\":" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"a.txt\"}" } }] }, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4 } },
    ]);
  };
  try {
    const result = await chatCompletions(preparedRequest(profile, {
      messages: [createTranscriptMessage({ role: "user", content: [textBlock("go")] })],
      tools: [{ name: "Read", description: "Read a file", parameters: { type: "object" } }],
      providerRequestBody: { max_tokens: 100 },
    }), "http://provider/v1", () => undefined);

    assert.equal(sentBody?.stream, true);
    assert.deepEqual(sentBody?.stream_options, { include_usage: true });
    assert.equal(sentBody?.parallel_tool_calls, true);
    assert.equal(getMessageReasoning(result.message), "think ");
    assert.equal(getMessageText(result.message), "answer");
    assert.deepEqual(getToolUses(result.message)[0]?.input, { path: "a.txt" });
    assert.equal(result.finishReason, "tool_use");
    assert.equal(result.stats?.inputTokens, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Chat Completions supports non-streaming JSON profiles", async () => {
  const profile = getModelProfile("generic/openai-chat-json-text");
  assert.ok(profile);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: "json answer" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  });
  try {
    const result = await chatCompletions(
      preparedRequest(profile),
      "http://provider/v1",
      () => undefined,
    );
    assert.equal(getMessageText(result.message), "json answer");
    assert.equal(result.stats?.outputTokens, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Responses supports event streaming and commits continuation state", async () => {
  const profile = getModelProfile("generic/openai-responses-text");
  assert.ok(profile);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => streamResponse([
    { type: "response.output_item.added", output_index: 0, item: { type: "message", role: "assistant", content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "hello" },
    { type: "response.completed", response: {
      id: "resp_1",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] }],
      usage: { input_tokens: 5, output_tokens: 1 },
    } },
  ]);
  try {
    const result = await responses(preparedRequest(profile, {
      messages: [createTranscriptMessage({ id: "user_1", role: "user", content: [textBlock("hi")] })],
    }), "http://provider/v1", () => undefined);
    assert.equal(getMessageText(result.message), "hello");
    assert.equal(result.debug?.responseId, "resp_1");
    assert.equal(result.transportState?.endpoint, "responses");
    if (result.transportState?.endpoint === "responses") {
      assert.equal(result.transportState.lastResponseId, "resp_1");
      assert.ok(result.transportState.syncedMessageIds.includes("user_1"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Responses supports non-streaming JSON and incomplete output", async () => {
  const profile = getModelProfile("generic/openai-responses-json-text");
  assert.ok(profile);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    id: "resp_json",
    status: "incomplete",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "partial" }] }],
    usage: { input_tokens: 5, output_tokens: 3 },
  });
  try {
    const result = await responses(
      preparedRequest(profile),
      "http://provider/v1",
      () => undefined,
    );
    assert.equal(getMessageText(result.message), "partial");
    assert.equal(result.finishReason, "length");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
