import assert from "node:assert/strict";
import test from "node:test";
import { getDefaults } from "../../lib/defaults.js";
import type { AgentPromptSections } from "../types.js";
import { normalizeAgentConfig } from "./agent-config.js";

test("agent normalization keeps the current prompt schema and required tools", () => {
  const defaults = getDefaults();
  const legacyPromptSections = {
    ...defaults.agent.promptSections,
    tasks: "obsolete task policy",
  } as AgentPromptSections;

  const normalized = normalizeAgentConfig({
    color: "invalid",
    promptSections: legacyPromptSections,
    toolIds: [],
  });

  assert.equal("tasks" in normalized.promptSections, false);
  assert.equal(normalized.color, defaults.agent.color);
  assert.deepEqual(normalized.toolIds, ["attachment"]);
});
