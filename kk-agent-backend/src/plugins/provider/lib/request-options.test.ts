import assert from "node:assert/strict";
import test from "node:test";
import { createTranscriptMessage, textBlock, type ModelInfo } from "kk-agent-contract";
import { normalizeRequestOptions } from "./request-options.js";
import {
  buildProfiledCapabilities,
  getModelProfile,
  getModelProfileSummary,
} from "./model-profiles/registry.js";

test("maps the canonical compaction output limit to the selected endpoint", () => {
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
