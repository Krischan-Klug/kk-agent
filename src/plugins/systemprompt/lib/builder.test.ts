import test from "node:test";
import assert from "node:assert/strict";
import type { AgentPromptSections } from "../../agent/types.js";
import { buildPrompt } from "./builder.js";

const PROMPT_SECTIONS: AgentPromptSections = {
  identity: "Identity",
  system: "System",
  runtime: "Runtime",
  tasks: "Tasks",
  security: "Security",
  toolUsage: "Use tools.",
  communication: "Communicate clearly.",
};

test("buildPrompt inserts runtime before mode context and keeps tool guidance before skills and communication", () => {
  const prompt = buildPrompt(
    PROMPT_SECTIONS,
    "Plan carefully.",
    "<tool_instruction id=\"filesystem\" name=\"Filesystem\">Read first</tool_instruction>",
    "<skills_catalog>\n  <skill id=\"repo-analysis\" name=\"Repo Analysis\" path=\"C:\\skills\\repo-analysis\" source=\"custom\" modes=\"plan,edit\">\n    <description>Analyze repo state.</description>\n  </skill>\n</skills_catalog>",
    {},
    { mode: "plan", iteration: 1, maxIterations: 4 },
  );

  const runtimeIndex = prompt.indexOf("<runtime>");
  const modeIndex = prompt.indexOf("<mode_context");
  const toolUsageIndex = prompt.indexOf("<tool_usage>");
  const toolInstructionIndex = prompt.indexOf("<tool_instruction");
  const skillsIndex = prompt.indexOf("<skills_catalog>");
  const communicationIndex = prompt.indexOf("<communication>");

  assert.notEqual(runtimeIndex, -1);
  assert.notEqual(modeIndex, -1);
  assert.notEqual(toolUsageIndex, -1);
  assert.notEqual(toolInstructionIndex, -1);
  assert.notEqual(skillsIndex, -1);
  assert.notEqual(communicationIndex, -1);
  assert.ok(runtimeIndex < modeIndex);
  assert.ok(toolUsageIndex < skillsIndex);
  assert.ok(toolUsageIndex < toolInstructionIndex);
  assert.ok(toolInstructionIndex < skillsIndex);
  assert.ok(skillsIndex < communicationIndex);
});
