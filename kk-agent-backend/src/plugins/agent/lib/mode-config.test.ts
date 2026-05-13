import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultModeConfig,
  expandModeConfig,
  compactModeConfig,
  buildDefaultModes,
  expandPersistedMode,
  compactEffectiveMode,
} from "./mode-config.js";
import type { AgentModeDefinition } from "../types.js";
import type { PersistedAgentModeDefinition } from "./persisted-types.js";

test("expandModeConfig with no overrides returns default config", () => {
  const config = expandModeConfig("edit");
  const defaultConfig = buildDefaultModeConfig("edit");
  assert.deepEqual(config, defaultConfig);
});

test("expandModeConfig with overrides merges correctly", () => {
  const config = expandModeConfig("edit", {
    promptSections: {
      communication: "Custom communication",
    },
  } as Partial<import("../types.js").AgentModeConfig>);
  assert.equal(config.promptSections.communication, "Custom communication");
  assert.equal(config.promptSections.identity, buildDefaultModeConfig("edit").promptSections.identity);
});

test("compactModeConfig returns empty object when effective equals default", () => {
  const defaultConfig = buildDefaultModeConfig("plan");
  const compact = compactModeConfig("plan", defaultConfig);
  assert.deepEqual(compact, {});
});

test("compactModeConfig returns only changed fields", () => {
  const defaultConfig = buildDefaultModeConfig("plan");
  const effective = {
    ...defaultConfig,
    modeInstruction: "Custom instruction",
  };
  const compact = compactModeConfig("plan", effective);
  assert.deepEqual(compact, { modeInstruction: "Custom instruction" });
});

test("buildDefaultModes produces effective modes with full configs", () => {
  const modes = buildDefaultModes();
  assert.equal(modes.length, 3);
  for (const mode of modes) {
    assert.ok(mode.config.promptSections.identity);
    assert.ok(mode.config.modeInstruction);
  }
});

test("expandPersistedMode expands configOverrides to full config", () => {
  const persisted: PersistedAgentModeDefinition = {
    id: "edit",
    label: "Edit",
    behavior: "edit",
    source: "builtin",
    enabled: true,
    configOverrides: {
      promptSections: {
        toolUsage: "Custom tool usage",
      },
    } as Partial<import("../types.js").AgentModeConfig>,
  };
  const expanded = expandPersistedMode(persisted);
  assert.equal(expanded.config.promptSections.toolUsage, "Custom tool usage");
  assert.equal(expanded.config.promptSections.identity, buildDefaultModeConfig("edit").promptSections.identity);
});

test("compactEffectiveMode compacts full config to configOverrides", () => {
  const defaultConfig = buildDefaultModeConfig("autonomous");
  const mode: AgentModeDefinition = {
    id: "autonomous",
    label: "Autonomous",
    behavior: "autonomous",
    source: "builtin",
    enabled: true,
    config: defaultConfig,
  };
  const compact = compactEffectiveMode(mode);
  assert.deepEqual(compact.configOverrides, {});
});

test("compactEffectiveMode preserves real overrides", () => {
  const defaultConfig = buildDefaultModeConfig("plan");
  const mode: AgentModeDefinition = {
    id: "plan",
    label: "Plan",
    behavior: "plan",
    source: "builtin",
    enabled: true,
    config: {
      ...defaultConfig,
      promptSections: {
        ...defaultConfig.promptSections,
        communication: "Custom communication",
      },
      modeInstruction: "Custom plan instruction",
    },
  };
  const compact = compactEffectiveMode(mode);
  assert.equal(compact.configOverrides?.promptSections?.communication, "Custom communication");
  assert.equal(compact.configOverrides?.modeInstruction, "Custom plan instruction");
  assert.equal(compact.configOverrides?.promptSections?.identity, undefined);
});

test("Agent without Prompt-Override bekommt neue CODE_DEFAULTS.agent.promptSections.toolUsage", () => {
  const persisted: PersistedAgentModeDefinition = {
    id: "edit",
    label: "Edit",
    behavior: "edit",
    source: "builtin",
    enabled: true,
    configOverrides: {},
  };
  const expanded = expandPersistedMode(persisted);
  assert.ok(expanded.config.promptSections.toolUsage.includes("tool_call_description"));
});
