import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiProviderAdapter } from "./openai.js";

test("discovers OpenAI models and retains common runtime metadata without vendor routes", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let authorization: string | null = null;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({
      object: "list",
      data: [{
        id: "model-a",
        object: "model",
        owned_by: "example",
        loaded: true,
        context_length: 65_536,
        max_context_length: 262_144,
        capabilities: { vision: true, tools: true, reasoning: false },
      }],
    });
  };
  try {
    const adapter = createOpenAiProviderAdapter({
      id: "provider-a",
      name: "Compatible",
      baseUrl: "http://127.0.0.1:8888/v1/",
      apiKey: "secret",
    });
    const models = await adapter.listModels();
    assert.equal(requestedUrl, "http://127.0.0.1:8888/v1/models");
    assert.equal(authorization, "Bearer secret");
    assert.deepEqual(models, [{
      id: "model-a",
      object: "model",
      providerId: "provider-a",
      ownedBy: "example",
      loaded: true,
      contextLength: 65_536,
      maxContextLength: 262_144,
      runtimeCapabilities: {
        visualInputSupported: true,
        nativeToolsSupported: true,
        reasoningSupported: false,
      },
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
