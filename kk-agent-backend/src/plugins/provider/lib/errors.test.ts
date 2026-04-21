import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError, computeBackoffMs } from "./errors.js";

test("classifies 413 as prompt_too_long", () => {
  const error = new Error("Chat Completions error 413: prompt is too long");
  assert.equal(classifyProviderError(error).kind, "prompt_too_long");
});

test("classifies context_length_exceeded as prompt_too_long", () => {
  const error = new Error("openai error: context_length_exceeded");
  assert.equal(classifyProviderError(error).kind, "prompt_too_long");
});

test("classifies 429 as rate_limit", () => {
  const error = new Error("Chat Completions error 429: too many requests");
  assert.equal(classifyProviderError(error).kind, "rate_limit");
});

test("classifies 5xx as transient", () => {
  const error = new Error("Responses API error 503: upstream");
  assert.equal(classifyProviderError(error).kind, "transient");
});

test("classifies network errors as transient", () => {
  const error = new Error("fetch failed: ECONNRESET");
  assert.equal(classifyProviderError(error).kind, "transient");
});

test("unknown errors are fatal", () => {
  const error = new Error("something totally unexpected");
  assert.equal(classifyProviderError(error).kind, "fatal");
});

test("computeBackoffMs grows with attempts", () => {
  const first = computeBackoffMs(1);
  const third = computeBackoffMs(3);
  assert.ok(first >= 1000 && first < 2000);
  assert.ok(third >= 9000 && third < 10_000);
});
