import test from "node:test";
import assert from "node:assert/strict";
import { mockFetch } from "../../../../test-helpers.js";
import { createLocalProviderAdapter } from "./local.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    async json() {
      return body;
    },
  } as Response;
}

test("detectModels fetches OpenAI-compatible /models and maps to generic capabilities", async (t) => {
  mockFetch(t, async (input) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return jsonResponse({
        data: [{ id: "qwen3" }, { id: "llama-3" }],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "OpenAI-compatible",
    baseUrl: "http://localhost:1234/v1",
  });

  const models = await adapter.listModels();
  assert.equal(models.length, 2);
  assert.equal(models[0]?.id, "qwen3");
  assert.equal(models[0]?.providerId, "provider-1");
  assert.deepEqual(models[0]?.capabilities.supportedEndpoints, [
    "responses",
    "chat-completions",
  ]);
  assert.equal(
    models[0]?.capabilities.transportProfiles?.responses?.supported,
    true,
  );
  assert.equal(
    models[0]?.capabilities.transportProfiles?.["chat-completions"]?.supported,
    true,
  );
});

test("detectModels throws when /models is unreachable", async (t) => {
  mockFetch(t, async () => jsonResponse({ error: "not found" }, false));

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "Broken",
    baseUrl: "http://localhost:9999/v1",
  });

  await assert.rejects(adapter.listModels(), /Failed to fetch models/);
});

test("testConnection returns ok:false with error message when fetch fails", async (t) => {
  mockFetch(t, async () => jsonResponse({ error: "not found" }, false));

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "Broken",
    baseUrl: "http://localhost:9999/v1",
  });

  const result = await adapter.testConnection();
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Failed to fetch models/);
});

test("testConnection returns ok:true when fetch succeeds", async (t) => {
  mockFetch(t, async (input) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return jsonResponse({ data: [{ id: "model-a" }] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "OK",
    baseUrl: "http://localhost:1234/v1",
  });

  const result = await adapter.testConnection();
  assert.equal(result.ok, true);
});
