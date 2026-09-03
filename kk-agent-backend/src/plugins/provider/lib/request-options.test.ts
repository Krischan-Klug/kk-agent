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
  const profile = getModelProfile("generic/openai-chat-text");
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

test("uses the profile transport for Qwen compaction", () => {
  const profile = getModelProfile("qwen/qwen3.8-27b");
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

  assert.equal(normalized.endpoint, "chat-completions");
  assert.equal(normalized.resolvedLlmRequestConfig.endpoint, "chat-completions");
  assert.deepEqual(normalized.providerRequestBody?.chat_template_kwargs, {
    enable_thinking: false,
    preserve_thinking: false,
  });
  assert.equal(normalized.providerRequestBody?.max_tokens, 8_000);
});

test("rejects image projection when the provider runtime narrows visual input", () => {
  const profile = getModelProfile("qwen/qwen3.8-27b");
  assert.ok(profile);
  const configured = buildProfiledCapabilities(profile, { visualInputSupported: false });
  const model: ModelInfo = {
    id: "qwen/qwen3.8-27b",
    object: "model",
    providerId: "provider",
    runtimeCapabilities: { visualInputSupported: false },
    profile: getModelProfileSummary(profile),
    capabilities: configured.capabilities,
    compatibilityIssues: configured.issues,
  };

  assert.throws(() => normalizeRequestOptions(model, { profileId: profile.id }, {
    model: model.id,
    instructions: "Inspect",
    messages: [createTranscriptMessage({ id: "image-message", role: "user", content: [textBlock("image")] })],
    modelContentByMessageId: {
      "image-message": [{ type: "image", dataUrl: "data:image/png;base64,AA==" }],
    },
  }), /cannot accept image input/);
});
