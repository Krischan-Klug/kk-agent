import test from "node:test";
import assert from "node:assert/strict";
import type { ProviderAdapter } from "./lib/adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "./lib/types.js";
import type { ModelInfo, ModelSettings } from "./types.js";
import {
  __getProviderStateForTests,
  __resetProviderServiceForTests,
  __setProviderAdapterFactoryForTests,
  callProvider,
  getModelSettings,
  getModels,
  resolveProviderModel,
  updateProvider,
} from "./service.js";
import { createTranscriptMessage, reasoningBlock, textBlock } from "../lib/transcript.js";

function createOpenAiCompatibleModel(): ModelInfo {
  return {
    id: "model-a",
    object: "model",
    providerId: "provider-1",
    capabilities: {
      supportsTools: true,
      supportsReasoning: true,
      visionSupport: "unknown",
      reasoningSource: "inferred",
      supportsStreaming: true,
      supportedEndpoints: ["responses", "chat-completions"],
      reasoningControl: "effort",
      reasoningLevels: ["minimal", "low", "medium", "high"],
      reasoning: {
        allowedEfforts: ["minimal", "low", "medium", "high"],
      },
      endpointCapabilities: {
        responses: {
          temperatureSupported: true,
          temperatureRange: { min: 0, max: 2, step: 0.1 },
          maxOutputTokensSupported: true,
          maxOutputTokensRange: { min: 1, max: 8192, step: 1 },
        },
        "chat-completions": {
          temperatureSupported: true,
          temperatureRange: { min: 0, max: 2, step: 0.1 },
          maxOutputTokensSupported: true,
          maxOutputTokensRange: { min: 1, max: 8192, step: 1 },
        },
      },
      transportProfiles: {
        responses: {
          supported: true,
          reasoningTransport: "responses-effort",
          toolSchemaTransport: "responses-tools",
          streamGrammar: "openai-responses",
          toolCallAssemblyMode: "responses-output-state",
          supportsConcatenatedJsonSplit: true,
          continuationMode: "previous-response-id",
          supportsStrictTools: false,
        },
        "chat-completions": {
          supported: true,
          reasoningTransport: "chat-completions-effort",
          toolSchemaTransport: "chat-completions-tools",
          streamGrammar: "openai-chat-completions",
          toolCallAssemblyMode: "chat-completions-indexed",
          supportsConcatenatedJsonSplit: true,
          continuationMode: "none",
          supportsStrictTools: true,
        },
      },
    },
  };
}

function createResponse(request: UnifiedRequest, content = "ok"): UnifiedResponse {
  return {
    message: createTranscriptMessage({
      role: "assistant",
      content: [textBlock(content)],
      stopReason: "stop",
    }),
    finishReason: "stop",
    debug: {
      endpoint: request.endpoint ?? "chat-completions",
    },
  };
}

function createAdapter(
  handlers: Partial<ProviderAdapter> & Pick<ProviderAdapter, "chat">,
): ProviderAdapter {
  return {
    type: "test",
    chat: handlers.chat,
    chatStream: handlers.chatStream ?? (async (request) => createResponse(request, "stream")),
    listModels: handlers.listModels ?? (async () => [createOpenAiCompatibleModel()]),
    testConnection: handlers.testConnection ?? (async () => ({ ok: true })),
  };
}

test.beforeEach(() => {
  __resetProviderServiceForTests({
    providers: [{
      id: "provider-1",
      name: "Local",
      baseUrl: "http://provider.test",
    }],
  });
});

test("callProvider falls back from responses to chat-completions and persists the observation", async () => {
  const attemptedEndpoints: string[] = [];

  __setProviderAdapterFactoryForTests(() => createAdapter({
    async chat(request) {
      attemptedEndpoints.push(request.endpoint ?? "chat-completions");
      if (request.endpoint === "responses") {
        throw new Error("404 unsupported endpoint /v1/responses");
      }
      return {
        message: createTranscriptMessage({
          role: "assistant",
          content: [reasoningBlock("brief chain"), textBlock("fallback ok")],
          stopReason: "stop",
        }),
        finishReason: "stop",
        stats: {
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 3,
          source: "provider",
        },
      };
    },
  }));

  const response = await callProvider({
    providerId: "provider-1",
    model: "model-a",
    messages: [],
  });

  assert.deepEqual(attemptedEndpoints, ["responses", "chat-completions"]);
  assert.equal(response.notices?.[0]?.code, "endpoint_fallback");
  assert.deepEqual(response.debug?.attemptedEndpoints, ["responses", "chat-completions"]);
  assert.equal(response.debug?.endpointSelection, "implicit");
  assert.equal(response.debug?.fallback?.from, "responses");
  assert.equal(response.debug?.fallback?.to, "chat-completions");
  assert.match(response.debug?.fallback?.reason ?? "", /responses failed with HTTP 404/i);
  assert.equal(response.debug?.resolvedRequestConfig?.common.endpoint, "chat-completions");

  const observedState = __getProviderStateForTests();
  assert.equal(
    observedState.observedCapabilities["provider-1::model-a"]?.endpointSupport?.responses,
    "unsupported",
  );
  assert.equal(
    observedState.observedCapabilities["provider-1::model-a"]?.endpointSupport?.["chat-completions"],
    "supported",
  );
  assert.equal(
    observedState.observedCapabilities["provider-1::model-a"]?.reasoningSupport?.["chat-completions"],
    "supported",
  );
});

test("callProvider does not auto-fallback when the endpoint was explicitly overridden", async () => {
  const attemptedEndpoints: string[] = [];

  __setProviderAdapterFactoryForTests(() => createAdapter({
    async chat(request) {
      attemptedEndpoints.push(request.endpoint ?? "chat-completions");
      throw new Error("405 unsupported endpoint /v1/responses");
    },
  }));

  await assert.rejects(
    callProvider({
      providerId: "provider-1",
      model: "model-a",
      messages: [],
      llmRequestConfig: {
        common: {
          endpoint: "responses",
        },
      },
    }),
    /unsupported endpoint/i,
  );

  assert.deepEqual(attemptedEndpoints, ["responses"]);
  assert.equal(
    __getProviderStateForTests().observedCapabilities["provider-1::model-a"]?.endpointSupport?.responses,
    "unsupported",
  );
});

test("callProvider persists response_statefulness unsupported when the adapter fell back to raw replay", async () => {
  __setProviderAdapterFactoryForTests(() => createAdapter({
    async chat(request) {
      return {
        ...createResponse(request, "fallback replay"),
        debug: {
          endpoint: "responses",
          continuationMode: "raw-output-replay",
          continuationFallback: {
            from: "previous-response-id",
            to: "raw-output-replay",
            reason: "previous_response_id failed with HTTP 400: unsupported",
          },
        },
      };
    },
  }));

  await callProvider({
    providerId: "provider-1",
    model: "model-a",
    messages: [],
  });

  assert.equal(
    __getProviderStateForTests().observedCapabilities["provider-1::model-a"]?.responsesStatefulness,
    "unsupported",
  );
});

test("callProvider marks vision support as observed when an image input succeeds", async () => {
  __setProviderAdapterFactoryForTests(() => createAdapter({
    async chat(request) {
      return createResponse(request, "image ok");
    },
  }));

  await callProvider({
    providerId: "provider-1",
    model: "model-a",
    messages: [createTranscriptMessage({
      role: "user",
      content: [{
        type: "attachment_ref",
        filename: "image.png",
        mimeType: "image/png",
        category: "image",
        source: "user",
        size: 123,
        previewDataUrl: "data:image/png;base64,AAA",
      }],
    })],
  });

  assert.equal(
    __getProviderStateForTests().observedCapabilities["provider-1::model-a"]?.visionSupport,
    "supported",
  );
});

test("updateProvider clears observed capabilities when connection credentials change", async () => {
  __resetProviderServiceForTests({
    providers: [{
      id: "provider-1",
      name: "Local",
      baseUrl: "http://provider.test",
      apiKey: "before",
    }],
    observedCapabilities: {
      "provider-1::model-a": {
        endpointSupport: {
          responses: "unsupported",
        },
        lastObservedAt: new Date().toISOString(),
      },
    },
  });

  await updateProvider("provider-1", { baseUrl: "http://provider-2.test", apiKey: "after" });

  assert.deepEqual(__getProviderStateForTests().observedCapabilities, {});
});

test("getModelSettings returns only the supported model settings shape", () => {
  __resetProviderServiceForTests({
    providers: [{
      id: "provider-1",
      name: "Local",
      baseUrl: "http://provider.test",
    }],
    modelSettings: {
      "provider-1::model-a": {
        llmRequestConfig: {
          common: {
            reasoningEffort: "medium",
            temperature: 0.6,
            maxOutputTokens: 1024,
          },
          extraBody: {
            responses: {
              chat_template_kwargs: {
                enable_thinking: true,
                preserve_thinking: true,
              },
            },
          },
        },
        unexpectedField: {
          stale: true,
        },
      } as ModelSettings & {
        unexpectedField?: Record<string, unknown>;
      },
    },
  });

  const settings = getModelSettings("provider-1", "model-a");
  assert.deepEqual(settings, {
    llmRequestConfig: {
      common: {
        reasoningEffort: "medium",
        temperature: 0.6,
        maxOutputTokens: 1024,
      },
      extraBody: {
        responses: {
          chat_template_kwargs: {
            enable_thinking: true,
            preserve_thinking: true,
          },
        },
      },
    },
  });
});

test("observed reasoning restores canonical efforts for on-off declared models", async () => {
  __resetProviderServiceForTests({
    providers: [{
      id: "provider-1",
      name: "Local",
      baseUrl: "http://provider.test",
    }],
    observedCapabilities: {
      "provider-1::model-a": {
        reasoningSupport: {
          "chat-completions": "supported",
        },
        lastObservedAt: new Date().toISOString(),
      },
    },
  });

  __setProviderAdapterFactoryForTests(() => createAdapter({
    async listModels() {
      return [{
        ...createOpenAiCompatibleModel(),
        capabilities: {
          ...createOpenAiCompatibleModel().capabilities,
          supportsReasoning: false,
          reasoningControl: "on-off",
          reasoningLevels: [],
          reasoning: {
            allowedEfforts: [],
          },
        },
      }];
    },
    async chat(request) {
      return createResponse(request);
    },
  }));

  const [model] = await getModels("provider-1");
  assert.equal(model?.capabilities.supportsReasoning, true);
  assert.deepEqual(model?.capabilities.reasoningLevels, ["minimal", "low", "medium", "high"]);
  assert.deepEqual(model?.capabilities.reasoning?.allowedEfforts, ["minimal", "low", "medium", "high"]);
});

test("getModels without provider aggregates models from all providers", async () => {
  __resetProviderServiceForTests({
    providers: [
      { id: "provider-1", name: "Local A", baseUrl: "http://provider-a.test" },
      { id: "provider-2", name: "Local B", baseUrl: "http://provider-b.test" },
    ],
    modelSettings: {
      "provider-1::shared-model": {
        llmRequestConfig: { common: { temperature: 0.2 } },
      },
      "provider-2::shared-model": {
        llmRequestConfig: { common: { temperature: 0.8 } },
      },
    },
  });

  __setProviderAdapterFactoryForTests((provider) => createAdapter({
    async listModels() {
      return [{
        ...createOpenAiCompatibleModel(),
        id: "shared-model",
        providerId: provider.id,
      }];
    },
    async chat(request) {
      return createResponse(request);
    },
  }));

  const models = await getModels();
  assert.deepEqual(models.map((model) => `${model.providerId}::${model.id}`), [
    "provider-1::shared-model",
    "provider-2::shared-model",
  ]);
});

test("resolveProviderModel accepts a global model ref without active provider state", async () => {
  __resetProviderServiceForTests({
    providers: [
      { id: "provider-1", name: "Local A", baseUrl: "http://provider-a.test" },
      { id: "provider-2", name: "Local B", baseUrl: "http://provider-b.test" },
    ],
  });

  __setProviderAdapterFactoryForTests((provider) => createAdapter({
    async listModels() {
      return [{
        ...createOpenAiCompatibleModel(),
        id: "model-a",
        providerId: provider.id,
      }];
    },
    async chat(request) {
      return createResponse(request);
    },
  }));

  assert.deepEqual(await resolveProviderModel(undefined, "provider-2::model-a"), {
    providerId: "provider-2",
    model: "model-a",
  });
});
