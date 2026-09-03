import assert from "node:assert/strict";
import test from "node:test";
import { ProviderError } from "./errors.js";
import { readSSEStream } from "./sse.js";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

test("parses standards-compliant SSE fields, CRLF boundaries, and multiline data", async () => {
  const events: Record<string, unknown>[] = [];
  await readSSEStream(sseResponse([
    ": keepalive\r\nevent: message\r\ndata:{\"value\":\r\n",
    "data: 42}\r\n\r\ndata: [DONE]\r\n\r\n",
  ]), (event) => {
    events.push(event);
    return false;
  });
  assert.deepEqual(events, [{ value: 42 }]);
});

test("rejects malformed JSON instead of silently dropping provider output", async () => {
  await assert.rejects(
    readSSEStream(sseResponse(["data: {broken}\n\n"]), () => false),
    (error) => error instanceof ProviderError && /malformed JSON/.test(error.message),
  );
});

test("surfaces a provider error even after valid output events", async () => {
  const events: Record<string, unknown>[] = [];
  await assert.rejects(
    readSSEStream(sseResponse([
      "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
      "data: {\"error\":{\"message\":\"worker crashed\",\"code\":\"worker_error\"}}\n\n",
    ]), (event) => {
      events.push(event);
      return false;
    }),
    (error) => error instanceof ProviderError && error.code === "worker_error",
  );
  assert.equal(events.length, 1);
});

test("rejects a non-SSE response before consuming it", async () => {
  await assert.rejects(
    readSSEStream(new Response("{}", { headers: { "content-type": "application/json" } }), () => false),
    /Expected text\/event-stream/,
  );
});
