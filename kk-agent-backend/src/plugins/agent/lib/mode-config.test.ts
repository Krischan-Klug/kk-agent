import assert from "node:assert/strict";
import test from "node:test";
import { getDefaults } from "../../lib/defaults.js";
import type { AgentModeDefinition, AgentPromptSections } from "../types.js";
import { normalizeModeDefinitions } from "./mode-config.js";

test("mode normalization drops the removed legacy tasks prompt section", () => {
  const defaults = getDefaults();
  const legacyPromptSections = {
    ...defaults.agent.promptSections,
    tasks: "legacy task policy",
  } as AgentPromptSections;
  const legacyMode: AgentModeDefinition = {
    id: "edit",
    label: "Edit",
    behavior: "edit",
    source: "builtin",
    enabled: true,
    config: {
      ...defaults.agent.modeTemplates.edit,
      promptSections: legacyPromptSections,
      mcpIds: [],
      skillIds: [],
      toolAccessScopes: {},
      mcpInstructions: {},
    },
  };

  const [normalized] = normalizeModeDefinitions([legacyMode]);

  assert.ok(normalized);
  assert.equal("tasks" in normalized.config.promptSections, false);
});
