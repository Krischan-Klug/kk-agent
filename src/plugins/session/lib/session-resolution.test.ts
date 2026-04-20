import test from "node:test";
import assert from "node:assert/strict";
import { resolveSessionLlmRequestConfig } from "./session-resolution.js";
import type { SessionState } from "../types.js";

test("resolveSessionLlmRequestConfig keeps session-scoped overrides in the provider request config", () => {
  const session: SessionState = {
    id: "session-1",
    name: "",
    providerId: "provider-1",
    model: "model-1",
    agentId: "agent-1",
    activeMode: "edit",
    activeToolIds: [],
    activeMcpIds: [],
    activeSkillIds: [],
    llmRequestConfig: {
      common: {
        endpoint: "responses",
        reasoningEffort: "high",
        temperature: 0.5,
        maxOutputTokens: 2048,
      },
      extraBody: {
        responses: {
          chat_template_kwargs: {
            enable_thinking: true,
            preserve_thinking: true,
          },
        },
      },
    },
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const resolved = resolveSessionLlmRequestConfig(session);

  assert.equal(resolved?.common?.reasoningEffort, "high");
  assert.equal(resolved?.common?.temperature, 0.5);
  assert.equal(resolved?.common?.endpoint, "responses");
  assert.equal(resolved?.common?.maxOutputTokens, 2048);
  assert.deepEqual(resolved?.extraBody?.responses, {
    chat_template_kwargs: {
      enable_thinking: true,
      preserve_thinking: true,
    },
  });
});
