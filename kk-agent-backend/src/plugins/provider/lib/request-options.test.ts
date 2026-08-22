import assert from "node:assert/strict";
import test from "node:test";
import { createTranscriptMessage, textBlock, type ModelInfo } from "kk-agent-contract";
import { normalizeRequestOptions } from "./request-options.js";
import {
  buildProfiledCapabilities,
  getModelProfile,
  getModelProfileSummary,
} from "./model-profiles/registry.js";

test("maps a canonical output limit to the selected endpoint", () => {
  const profile = getModelProfile("generic/openai-chat-text@v1");
  assert.ok(profile);
  const configured = buildProfiledCapabilities(profile, {});
  const model: ModelInfo = {
    id: "test-model",
    object: "model",
    providerId: "provider",
    runtimeCapabilities: {},
    profile: getModelProfileSummary(profile),
    capabilities: configured.capabilities,
    compatibilityIssues: configured.issues,
  };

  const normalized = normalizeRequestOptions(
    model,
    { profileId: profile.id },
    {
      model: model.id,
      instructions: "Summarize",
      messages: [createTranscriptMessage({ role: "user", content: [textBlock("history")] })],
      maxOutputTokens: 6_000,
    },
  );

  assert.equal(normalized.providerRequestBody?.max_tokens, 6_000);
});

test("uses the explicit LM Studio compaction recipe for Qwen without leaking unsupported template kwargs", () => {
  const profile = getModelProfile("qwen/qwen3.8-27b@v1");
  assert.ok(profile);
  const configured = buildProfiledCapabilities(profile, {});
  const model: ModelInfo = {
    id: "qwen/qwen3.8-27b",
    object: "model",
    providerId: "provider",
    runtimeCapabilities: {},
    profile: getModelProfileSummary(profile),
    capabilities: configured.capabilities,
    compatibilityIssues: configured.issues,
  };
  const normalized = normalizeRequestOptions(model, { profileId: profile.id }, {
    model: model.id,
    purpose: "compaction",
    instructions: "Summarize",
    messages: [createTranscriptMessage({ role: "user", content: [textBlock("history")] })],
    llmRequestConfig: { reasoning: { effort: "none", history: "discard" } },
    maxOutputTokens: profile.compaction.maxOutputTokens,
  });

  assert.equal(normalized.endpoint, "lmstudio-chat");
  assert.equal(normalized.resolvedLlmRequestConfig?.endpoint, "lmstudio-chat");
  assert.equal(normalized.providerRequestBody?.reasoning, "off");
  assert.equal(normalized.providerRequestBody?.max_output_tokens, 8_000);
  assert.equal(normalized.providerRequestBody?.chat_template_kwargs, undefined);
  assert.equal(normalized.providerRequestBody?.max_tokens, undefined);
});
