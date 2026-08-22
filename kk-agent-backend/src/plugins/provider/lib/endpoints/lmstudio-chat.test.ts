import assert from "node:assert/strict";
import test from "node:test";
import { createTranscriptMessage, getMessageText, textBlock } from "kk-agent-contract";
import { chatStream } from "./lmstudio-chat.js";

test("LM Studio native compaction sends reasoning off and returns direct text", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      output: [{ type: "message", content: "# Continuation State\nvalid" }],
      stats: { input_tokens: 100, total_output_tokens: 20, reasoning_output_tokens: 0 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await chatStream({
      model: "qwen/qwen3.8-27b",
      instructions: "Summarize safely",
      messages: [createTranscriptMessage({ role: "user", content: [textBlock("evidence")] })],
      providerRequestBody: { reasoning: "off", max_output_tokens: 8_000 },
    }, "http://127.0.0.1:1234/v1", () => undefined);

    assert.equal(capturedUrl, "http://127.0.0.1:1234/api/v1/chat");
    assert.equal(capturedBody.reasoning, "off");
    assert.equal(capturedBody.store, false);
    assert.equal(capturedBody.system_prompt, "Summarize safely");
    assert.equal(capturedBody.input, "evidence");
    assert.equal(getMessageText(response.message), "# Continuation State\nvalid");
    assert.equal(response.stats?.reasoningTokens, 0);
    assert.equal(response.debug?.endpoint, "lmstudio-chat");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LM Studio request is cancelled by the run abort signal", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  try {
    const request = chatStream({
      model: "test-model",
      instructions: "test",
      messages: [createTranscriptMessage({ role: "user", content: [textBlock("test")] })],
      signal: controller.signal,
    }, "http://127.0.0.1:1234/v1", () => undefined);
    controller.abort();
    await assert.rejects(request, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
