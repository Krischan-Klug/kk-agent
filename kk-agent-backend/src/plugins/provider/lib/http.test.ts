import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderError, ProviderError } from "./errors.js";
import { requestProviderJson } from "./http.js";

test("preserves OpenAI error metadata and Retry-After for harness retry policy", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
      error: {
        message: "Too many requests",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        param: "model",
      },
    }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "2", "x-request-id": "req_123" },
    });

  let caught: unknown;
  try {
    await requestProviderJson("http://provider/v1/test", {}, "Test request");
  } catch (error) {
    caught = error;
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(caught instanceof ProviderError);
  assert.equal(caught.status, 429);
  assert.equal(caught.code, "rate_limit_exceeded");
  assert.equal(caught.requestId, "req_123");
  const classified = classifyProviderError(caught);
  assert.equal(classified.kind, "rate_limit");
  assert.equal(classified.retryAfterMs, 2_000);
});

test("times out while consuming a stalled JSON body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({ start() {} }));
  try {
    await assert.rejects(
      requestProviderJson(
        "http://provider/v1/test",
        {},
        "Slow JSON request",
        { timeoutMs: 10 },
      ),
      (error) => error instanceof ProviderError && /timed out/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not start a provider request when the run is already aborted", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  const controller = new AbortController();
  controller.abort(new DOMException("Cancelled", "AbortError"));
  try {
    await assert.rejects(
      requestProviderJson(
        "http://provider/v1/test",
        {},
        "Cancelled request",
        { signal: controller.signal },
      ),
      (error) => error instanceof DOMException && error.name === "AbortError",
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
