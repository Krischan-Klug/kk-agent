import test from "node:test";
import assert from "node:assert/strict";
import { createTranscriptMessage, reasoningBlock, textBlock, toolUseBlock } from "../../lib/transcript.js";
import { buildChatCompletionsBody, buildMessages } from "./helpers.js";
import type { UnifiedRequest } from "./types.js";

test("buildMessages preserves assistant reasoning separately from visible content", () => {
  const messages = [
    createTranscriptMessage({
      role: "assistant",
      content: [
        reasoningBlock("hidden reasoning"),
        textBlock("visible answer"),
      ],
    }),
  ];

  assert.deepEqual(buildMessages(messages), [{
    role: "assistant",
    reasoning: "hidden reasoning",
    content: "visible answer",
  }]);
});

test("buildMessages keeps assistant reasoning alongside tool calls", () => {
  const messages = [
    createTranscriptMessage({
      role: "assistant",
      content: [
        reasoningBlock("need a tool"),
        toolUseBlock("tool-1", "search_docs", { query: "qwen" }),
      ],
    }),
  ];

  assert.deepEqual(buildMessages(messages), [{
    role: "assistant",
    reasoning: "need a tool",
    content: null,
    tool_calls: [{
      id: "tool-1",
      type: "function",
      function: {
        name: "search_docs",
        arguments: "{\"query\":\"qwen\"}",
      },
    }],
  }]);
});

test("buildChatCompletionsBody applies extra body and keeps first-class fields authoritative", () => {
  const request: UnifiedRequest = {
    model: "qwen-test",
    messages: [
      createTranscriptMessage({
        role: "assistant",
        content: [
          reasoningBlock("history reasoning"),
          textBlock("history answer"),
        ],
      }),
    ],
    resolvedLlmRequestConfig: {
      common: {
        endpoint: "chat-completions",
        reasoningEffort: "medium",
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
      extraBody: {
        reasoning_effort: "low",
        temperature: 0.1,
        max_tokens: 512,
        chat_template_kwargs: {
          enable_thinking: true,
          preserve_thinking: true,
        },
      },
      omittedUnsupportedKeys: [],
    },
  };

  const body = buildChatCompletionsBody(request, false);

  assert.equal(body.reasoning_effort, "medium");
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 2048);
  assert.deepEqual(body.messages, [{
    role: "assistant",
    reasoning: "history reasoning",
    content: "history answer",
  }]);
  assert.deepEqual(body.chat_template_kwargs, {
    enable_thinking: true,
    preserve_thinking: true,
  });
});
