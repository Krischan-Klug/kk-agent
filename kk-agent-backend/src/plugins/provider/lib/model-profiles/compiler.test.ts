import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptMessage,
  getMessageReasoning,
  mergeLlmRequestConfigs,
  reasoningBlock,
  textBlock,
  toolUseBlock,
} from "kk-agent-contract";
import { compileModelRequest } from "./compiler.js";
import {
  buildProfiledCapabilities,
  getModelProfile,
  listModelProfiles,
  suggestModelProfile,
} from "./registry.js";
import type { ModelProfile } from "./types.js";
import {
  buildChatCompletionsBody,
  serializeAssistantMessageToResponsesInput,
} from "../helpers.js";

function profile(id: string): ModelProfile {
  const result = getModelProfile(id);
  assert.ok(result, `Missing test profile ${id}`);
  return result;
}

function historyFixture() {
  return [
    createTranscriptMessage({
      id: "assistant-plain",
      role: "assistant",
      content: [reasoningBlock("plain thought"), textBlock("plain answer")],
    }),
    createTranscriptMessage({
      id: "assistant-tool",
      role: "assistant",
      content: [reasoningBlock("tool thought"), toolUseBlock("call-1", "Read", { path: "a" })],
    }),
    createTranscriptMessage({ id: "user-1", role: "user", content: [textBlock("continue")] }),
  ];
}

test("Qwen 3.8 uses its thinking defaults and replays only the latest reasoning step", () => {
  const selectedProfile = profile("qwen/qwen3.8-27b@v1");
  const compiled = compileModelRequest({
    profile: selectedProfile,
    instructions: "system",
    messages: historyFixture(),
  });

  assert.equal(selectedProfile.id, "qwen/qwen3.8-27b@v1");
  assert.equal(compiled.body.reasoning_effort, "xhigh");
  assert.deepEqual(compiled.body.chat_template_kwargs, {
    enable_thinking: true,
    preserve_thinking: true,
  });
  assert.equal(compiled.body.temperature, 1);
  assert.equal(compiled.body.top_p, 0.95);
  assert.equal(compiled.body.top_k, 20);
  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
  assert.equal(getMessageReasoning(compiled.messages[1]!), "tool thought");
  assert.equal(compiled.resolved.reasoning.effectiveHistory, "latest");
});

test("Qwen 3.8 none switches thinking off and selects the direct sampling recipe", () => {
  const compiled = compileModelRequest({
    profile: profile("qwen/qwen3.8-27b@v1"),
    config: { reasoning: { effort: "none", history: "discard" } },
    instructions: "system",
    messages: historyFixture(),
  });

  assert.equal(compiled.body.reasoning_effort, undefined);
  assert.deepEqual(compiled.body.chat_template_kwargs, {
    enable_thinking: false,
    preserve_thinking: false,
  });
  assert.equal(compiled.body.temperature, 0.7);
  assert.equal(compiled.body.top_p, 0.8);
  assert.equal(compiled.body.presence_penalty, 1.5);
  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
});

test("discard removes historical reasoning including the active tool turn", () => {
  const messages = [
    ...historyFixture(),
    createTranscriptMessage({
      id: "assistant-current-tool",
      role: "assistant",
      content: [reasoningBlock("current thought"), toolUseBlock("call-2", "Read", { path: "b" })],
    }),
  ];
  const compiled = compileModelRequest({
    profile: profile("qwen/qwen3.8-27b@v1"),
    config: { reasoning: { history: "discard" } },
    instructions: "system",
    messages,
  });

  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
  assert.equal(getMessageReasoning(compiled.messages[3]!), "");
});

test("latest retains only the immediately preceding assistant reasoning", () => {
  const messages = [
    ...historyFixture(),
    createTranscriptMessage({
      id: "assistant-current-tool",
      role: "assistant",
      content: [reasoningBlock("current thought"), toolUseBlock("call-2", "Read", { path: "b" })],
    }),
  ];
  const compiled = compileModelRequest({
    profile: profile("qwen/qwen3.8-27b@v1"),
    config: { reasoning: { history: "latest" } },
    instructions: "system",
    messages,
  });

  assert.equal(getMessageReasoning(compiled.messages[1]!), "");
  assert.equal(getMessageReasoning(compiled.messages[3]!), "current thought");
});

test("Qwen 3.8 maps portable high to xhigh visibly", () => {
  const compiled = compileModelRequest({
    profile: profile("qwen/qwen3.8-27b@v1"),
    config: { reasoning: { effort: "high" } },
    instructions: "system",
    messages: [],
  });

  assert.equal(compiled.body.reasoning_effort, "xhigh");
  assert.equal(compiled.resolved.reasoning.effectiveEffort, "xhigh");
  assert.equal(compiled.resolved.warnings.length, 1);
});

test("Config layers merge independently and sampling overrides retain the profile recipe", () => {
  const config = mergeLlmRequestConfigs(
    { reasoning: { effort: "medium" }, sampling: { temperature: 0.8 } },
    { reasoning: { history: "discard" }, sampling: { topP: 0.9 } },
  );
  const compiled = compileModelRequest({
    profile: profile("qwen/qwen3.8-27b@v1"),
    config,
    instructions: "system",
    messages: historyFixture(),
  });

  assert.equal(compiled.resolved.reasoning.effectiveEffort, "medium");
  assert.equal(compiled.resolved.reasoning.effectiveHistory, "discard");
  assert.equal(compiled.body.temperature, 0.8);
  assert.equal(compiled.body.top_p, 0.9);
  assert.equal(compiled.body.top_k, 20);
  assert.equal(compiled.body.min_p, 0);
});

test("Gemma 4 uses binary thinking, tool-only reasoning history, and images-first projection", () => {
  const compiled = compileModelRequest({
    profile: profile("google/gemma-4-31b-it@v1"),
    config: { reasoning: { effort: "medium" } },
    instructions: "system",
    messages: historyFixture(),
    modelContentByMessageId: {
      "user-1": [
        { type: "text", text: "question" },
        { type: "image", dataUrl: "data:image/png;base64,AA==" },
      ],
    },
  });

  assert.equal(compiled.body.reasoning_effort, undefined);
  assert.equal(compiled.body.chat_template_kwargs, undefined);
  assert.equal(compiled.instructions, "<|think|>\nsystem");
  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
  assert.equal(getMessageReasoning(compiled.messages[1]!), "tool thought");
  assert.equal(compiled.modelContentByMessageId?.["user-1"]?.[0]?.type, "image");
  assert.equal(compiled.resolved.reasoning.effectiveEffort, "high");
  assert.equal(compiled.resolved.reasoning.effectiveHistory, "tool-turns");
});

test("Gemma 4 reports unsupported full-history preservation instead of pretending", () => {
  const compiled = compileModelRequest({
    profile: profile("google/gemma-4-31b-it@v1"),
    config: { reasoning: { history: "all" } },
    instructions: "system",
    messages: historyFixture(),
  });

  assert.equal(compiled.resolved.reasoning.requestedHistory, "all");
  assert.equal(compiled.resolved.reasoning.effectiveHistory, "tool-turns");
  assert.match(compiled.resolved.warnings[0] ?? "", /tool-call turns/);
});

test("Muse Glimmer applies reasoning strength through its official system contract", () => {
  const compiled = compileModelRequest({
    profile: profile("meta/muse-glimmer-30b@v1"),
    config: { reasoning: { effort: "xhigh" } },
    instructions: "You are an agent.",
    messages: historyFixture(),
  });

  assert.equal(compiled.instructions, "Reasoning strength: xhigh\nYou are an agent.");
  assert.equal(compiled.body.chat_template_kwargs, undefined);
  assert.equal(compiled.body.reasoning_effort, undefined);
  assert.equal(compiled.body.temperature, 1);
  assert.equal(compiled.body.top_k, 64);
  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
  assert.equal(compiled.resolved.reasoning.effectiveHistory, "discard");
});

test("Muse Glimmer does not invent undocumented historical reasoning replay", () => {
  const compiled = compileModelRequest({
    profile: profile("meta/muse-glimmer-30b@v1"),
    config: { reasoning: { history: "all" } },
    instructions: "system",
    messages: historyFixture(),
  });

  assert.equal(compiled.resolved.reasoning.effectiveHistory, "discard");
  assert.match(compiled.resolved.warnings[0] ?? "", /does not document/);
  assert.equal(getMessageReasoning(compiled.messages[0]!), "");
});

test("Muse Glimmer never pretends to support reasoning off", () => {
  const compiled = compileModelRequest({
    profile: profile("meta/muse-glimmer-30b@v1"),
    config: { reasoning: { effort: "none" } },
    instructions: "system",
    messages: [],
  });

  assert.equal(compiled.resolved.reasoning.effectiveEffort, "low");
  assert.equal(compiled.resolved.reasoning.enabled, true);
  assert.equal(compiled.resolved.warnings.length, 1);
  assert.equal(compiled.instructions, "Reasoning strength: low\nsystem");
});

test("Chat Completions keeps the system role first and serializes reasoning_content", () => {
  const body = buildChatCompletionsBody({
    model: "qwen/qwen3.8-27b",
    instructions: "system prompt",
    messages: historyFixture().slice(0, 1),
    providerRequestBody: { reasoning_effort: "xhigh" },
  });
  const messages = body.messages as Array<Record<string, unknown>>;

  assert.deepEqual(messages[0], { role: "system", content: "system prompt" });
  assert.equal(messages[1]?.reasoning_content, "plain thought");
  assert.equal(body.reasoning_effort, "xhigh");
});

test("Responses raw replay retains canonical reasoning blocks", () => {
  const items = serializeAssistantMessageToResponsesInput(historyFixture()[0]!);
  assert.deepEqual(items[0], {
    type: "reasoning",
    content: [{ type: "reasoning_text", text: "plain thought" }],
    summary: [],
  });
  assert.equal(items[1]?.type, "message");
});

test("Profile selection is exact and never activates through fuzzy model-name detection", () => {
  assert.equal(suggestModelProfile("Qwen/Qwen3.8-27B"), "qwen/qwen3.8-27b@v1");
  assert.equal(suggestModelProfile("qwen3.8"), undefined);
  assert.equal(suggestModelProfile("my-qwen3.8-27b-finetune"), undefined);
  assert.equal(getModelProfile("qwen/qwen3.8-27b"), undefined);
});

test("Profiles own endpoint and standardized capabilities", () => {
  const summaries = listModelProfiles();
  const qwen = summaries.find((entry) => entry.id === "qwen/qwen3.8-27b@v1");
  const gemma = summaries.find((entry) => entry.id === "google/gemma-4-31b-it@v1");
  const muse = summaries.find((entry) => entry.id === "meta/muse-glimmer-30b@v1");
  assert.equal(qwen?.endpoint, "chat-completions");
  assert.deepEqual(qwen?.inputModalities, ["text", "image", "video"]);
  assert.deepEqual(gemma?.inputModalities, ["text", "image", "video"]);
  assert.deepEqual(muse?.inputModalities, ["text", "image"]);
  assert.equal(muse?.tools.mode, "native");
});

test("Provider-declared visual artifact availability refines profile modalities", () => {
  const muse = profile("meta/muse-glimmer-30b@v1");
  const available = buildProfiledCapabilities(muse, { visualInputSupported: true });
  assert.equal(available.capabilities.inputModalities.includes("image"), true);
  assert.deepEqual(available.issues, []);

  const unavailable = buildProfiledCapabilities(muse, { visualInputSupported: false });
  assert.deepEqual(unavailable.capabilities.inputModalities, ["text"]);
  assert.equal(unavailable.issues.length, 1);
});
