import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedSystemToolRuntime } from "../../tools/service.js";
import { buildRuntimeToolCollection } from "./runtime-tools.js";
import { resolveSessionLlmRequestConfig } from "./session-resolution.js";
import type { SessionState } from "../types.js";

test("resolveSessionLlmRequestConfig keeps session-scoped overrides in the provider request config", () => {
  const session: SessionState = {
    id: "session-1",
    name: "",
    providerId: "provider-1",
    model: "model-1",
    agentId: "agent-1",
    activeMode: "edit",
    activeToolIds: [],
    activeMcpIds: [],
    activeSkillIds: [],
    llmRequestConfig: {
      common: {
        endpoint: "responses",
        reasoningEffort: "high",
        temperature: 0.5,
        maxOutputTokens: 2048,
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
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const resolved = resolveSessionLlmRequestConfig(session);

  assert.equal(resolved?.common?.reasoningEffort, "high");
  assert.equal(resolved?.common?.temperature, 0.5);
  assert.equal(resolved?.common?.endpoint, "responses");
  assert.equal(resolved?.common?.maxOutputTokens, 2048);
  assert.deepEqual(resolved?.extraBody?.responses, {
    chat_template_kwargs: {
      enable_thinking: true,
      preserve_thinking: true,
    },
  });
});

test("buildRuntimeToolCollection keeps CreateSkill out of plan runtimes when only Skill is allowed", () => {
  const systemRuntime: ResolvedSystemToolRuntime = {
    instructionsById: {},
    runtimeVariables: {},
    runtimeToolsByName: {
      Skill: {
        name: "Skill",
        description: "Load a skill.",
        parameters: {},
        inputSchema: {},
        source: "system",
        capabilityId: "skill",
        isConcurrencySafe: () => true,
        interruptBehavior: "block",
        resultPolicy: {},
        permissionPolicy: { kind: "allow" },
      },
      CreateSkill: {
        name: "CreateSkill",
        description: "Create a skill.",
        parameters: {},
        inputSchema: {},
        source: "system",
        capabilityId: "skill",
        isConcurrencySafe: () => false,
        interruptBehavior: "block",
        resultPolicy: {},
        permissionPolicy: { kind: "allow" },
      },
    },
  };

  const planRuntime = buildRuntimeToolCollection(systemRuntime, [], ["Skill"]);
  const editRuntime = buildRuntimeToolCollection(systemRuntime, [], ["Skill", "CreateSkill"]);

  assert.deepEqual(Object.keys(planRuntime.runtimeToolsByName), ["Skill"]);
  assert.deepEqual(Object.keys(editRuntime.runtimeToolsByName).sort(), ["CreateSkill", "Skill"]);
});
