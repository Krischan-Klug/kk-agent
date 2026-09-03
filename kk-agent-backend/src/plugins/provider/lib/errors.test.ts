import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderError, ProviderError } from "./errors.js";

test("classifies structured-compatible model_unloaded separately from transient and configuration failures", () => {
  const classified = classifyProviderError(new ProviderError(
    "Model is not loaded",
    { status: 400, code: "model_unloaded" },
  ));

  assert.equal(classified.kind, "model_unloaded");
  assert.equal(classified.status, 400);
});

test("recognizes the human-readable no-model-loaded variant", () => {
  assert.equal(classifyProviderError(new Error("No models loaded. Please load a model first.")).kind, "model_unloaded");
});
