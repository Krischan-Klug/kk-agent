import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderError } from "./errors.js";

test("classifies LM Studio model_unloaded separately from transient and configuration failures", () => {
  const classified = classifyProviderError(new Error(
    'LM Studio Chat error 400: {"error":{"type":"model_unloaded","message":"Model is not loaded"}}',
  ));

  assert.equal(classified.kind, "model_unloaded");
  assert.equal(classified.status, 400);
});

test("recognizes the human-readable no-model-loaded variant", () => {
  assert.equal(classifyProviderError(new Error("No models loaded. Please load a model first.")).kind, "model_unloaded");
});
