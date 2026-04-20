import test from "node:test";
import assert from "node:assert/strict";
import { mergeLlmRequestConfigs, sanitizeEndpointExtraBody } from "./request-config.js";

test("mergeLlmRequestConfigs applies later overrides and deep-merges additional request json", () => {
  const merged = mergeLlmRequestConfigs(
    {
      common: { endpoint: "responses", reasoningEffort: "medium", temperature: 0.4 },
      extraBody: {
        responses: {
          reasoning: {
            summary: "concise",
          },
          text: {
            verbosity: "low",
          },
        },
      },
    },
    {
      common: { temperature: 0.2, maxOutputTokens: 2048 },
      extraBody: {
        responses: {
          reasoning: {
            summary: "detailed",
          },
          extra_flag: true,
        },
      },
    },
  );

  assert.deepEqual(merged, {
    common: {
      endpoint: "responses",
      reasoningEffort: "medium",
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
    extraBody: {
      responses: {
        reasoning: {
          summary: "detailed",
        },
        text: {
          verbosity: "low",
        },
        extra_flag: true,
      },
    },
  });
});

test("sanitizeEndpointExtraBody strips only transport-owned keys", () => {
  const sanitized = sanitizeEndpointExtraBody("responses", {
    model: "ignored",
    input: [],
    stream: true,
    chat_template_kwargs: {
      enable_thinking: true,
      preserve_thinking: true,
    },
    reasoning: {
      summary: "concise",
    },
    temperature: 0.2,
  });

  assert.deepEqual(sanitized.value, {
    chat_template_kwargs: {
      enable_thinking: true,
      preserve_thinking: true,
    },
    reasoning: {
      summary: "concise",
    },
    temperature: 0.2,
  });
  assert.deepEqual(sanitized.omittedKeys.sort(), ["input", "model", "stream"]);
});

test("mergeLlmRequestConfigs preserves nested chat template kwargs for both endpoints", () => {
  const merged = mergeLlmRequestConfigs(
    {
      extraBody: {
        "chat-completions": {
          chat_template_kwargs: {
            enable_thinking: true,
          },
        },
        responses: {
          chat_template_kwargs: {
            enable_thinking: true,
          },
        },
      },
    },
    {
      extraBody: {
        "chat-completions": {
          chat_template_kwargs: {
            preserve_thinking: true,
          },
          top_k: 20,
        },
        responses: {
          chat_template_kwargs: {
            preserve_thinking: true,
          },
          top_k: 20,
        },
      },
    },
  );

  assert.deepEqual(merged?.extraBody, {
    "chat-completions": {
      chat_template_kwargs: {
        enable_thinking: true,
        preserve_thinking: true,
      },
      top_k: 20,
    },
    responses: {
      chat_template_kwargs: {
        enable_thinking: true,
        preserve_thinking: true,
      },
      top_k: 20,
    },
  });
});
