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

test("LM Studio discovery keeps a generic OpenAI-compatible capability profile", async (t) => {
  mockFetch(t, async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/models")) {
      return jsonResponse({
        models: [{
          key: "qwen3",
          max_context_length: 32768,
          loaded_instances: [{ config: { context_length: 16384 } }],
          capabilities: {
            reasoning: { allowed_options: ["low", "medium", "high"] },
            vision: {},
          },
        }],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "LM Studio",
    baseUrl: "http://localhost:1234",
  });

  const [model] = await adapter.listModels();
  assert.equal(model?.id, "qwen3");
  assert.deepEqual(model?.capabilities.supportedEndpoints, ["responses", "chat-completions"]);
  assert.equal(model?.capabilities.transportProfiles?.responses?.supported, true);
  assert.equal(model?.capabilities.transportProfiles?.["chat-completions"]?.supported, true);
  assert.equal(model?.capabilities.reasoningSource, "declared");
  assert.equal(model?.capabilities.visionSupport, "supported");
});

test("Ollama discovery exposes the same generic endpoint surface", async (t) => {
  mockFetch(t, async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/models")) return jsonResponse({}, false);
    if (url.endsWith("/api/tags")) {
      return jsonResponse({
        models: [{ name: "qwen3:8b" }],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
  });

  const [model] = await adapter.listModels();
  assert.equal(model?.id, "qwen3:8b");
  assert.deepEqual(model?.capabilities.supportedEndpoints, ["responses", "chat-completions"]);
  assert.equal(model?.capabilities.transportProfiles?.responses?.supported, true);
  assert.equal(model?.capabilities.transportProfiles?.["chat-completions"]?.supported, true);
  assert.equal(model?.capabilities.transportProfiles?.responses?.continuationMode, "previous-response-id");
  assert.equal(model?.capabilities.visionSupport, "unknown");
});

test("llama.cpp discovery no longer hardcodes chat-completions-only behavior", async (t) => {
  mockFetch(t, async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/models")) return jsonResponse({}, false);
    if (url.endsWith("/api/tags")) return jsonResponse({}, false);
    if (url.endsWith("/props")) {
      return jsonResponse({
        model_path: "/models/Qwen3-8B-Q4_K_M.gguf",
        default_generation_settings: { n_ctx: 8192 },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const adapter = createLocalProviderAdapter({
    id: "provider-1",
    name: "llama.cpp",
    baseUrl: "http://localhost:8080",
  });

  const [model] = await adapter.listModels();
  assert.equal(model?.id, "Qwen3-8B-Q4_K_M.gguf");
  assert.deepEqual(model?.capabilities.supportedEndpoints, ["responses", "chat-completions"]);
  assert.equal(model?.capabilities.transportProfiles?.responses?.supported, true);
  assert.equal(model?.capabilities.transportProfiles?.["chat-completions"]?.supported, true);
});
