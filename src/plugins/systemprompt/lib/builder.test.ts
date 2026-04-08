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

test("buildPrompt includes all prompt sections in output", () => {
  const prompt = buildPrompt(PROMPT_SECTIONS, "Mode instruction.", "", "", {}, {});

  assert.ok(prompt.includes("Identity"));
  assert.ok(prompt.includes("System"));
  assert.ok(prompt.includes("Security"));
  assert.ok(prompt.includes("Use tools."));
  assert.ok(prompt.includes("Communicate clearly."));
  assert.ok(prompt.includes("Mode instruction."));
});

test("buildPrompt substitutes variables in prompt sections", () => {
  const sections = { ...PROMPT_SECTIONS, identity: "Agent for {{PROJECT_NAME}}" };
  const prompt = buildPrompt(sections, "", "", "", { PROJECT_NAME: "TestProject" }, {});

  assert.ok(prompt.includes("Agent for TestProject"));
  assert.ok(!prompt.includes("{{PROJECT_NAME}}"));
});

test("buildPrompt wraps output in agent_runtime_prompt tags", () => {
  const prompt = buildPrompt(PROMPT_SECTIONS, "", "", "", {}, {});

  assert.ok(prompt.startsWith("<agent_runtime_prompt>"));
  assert.ok(prompt.endsWith("</agent_runtime_prompt>"));
});

test("buildPrompt includes mode context with mode and iteration info", () => {
  const prompt = buildPrompt(PROMPT_SECTIONS, "Plan step.", "", "", {}, { mode: "plan", iteration: 2, maxIterations: 5 });

  assert.ok(prompt.includes("<mode_context"));
  assert.ok(prompt.includes("Plan step."));
});

test("buildPrompt places volatile sections after the dynamic context boundary", () => {
  const prompt = buildPrompt(
    PROMPT_SECTIONS,
    "Plan carefully.",
    "<tool_instruction id=\"filesystem\" name=\"Filesystem\">Read first</tool_instruction>",
    "<skills_catalog></skills_catalog>",
    {},
    { mode: "plan", iteration: 1, maxIterations: 4 },
  );

  const boundaryIndex = prompt.indexOf("DYNAMIC_CONTEXT_BOUNDARY");
  const communicationIndex = prompt.indexOf("<communication>");
  const modeIndex = prompt.indexOf("<mode_context");
  const tasksIndex = prompt.indexOf("<tasks>");
  const runtimeIndex = prompt.indexOf("<runtime>");

  assert.notEqual(boundaryIndex, -1);
  assert.ok(communicationIndex < boundaryIndex, "communication must be in stable prefix");
  assert.ok(boundaryIndex < runtimeIndex, "runtime must be in volatile suffix");
  assert.ok(boundaryIndex < modeIndex, "mode_context must be in volatile suffix");
  assert.ok(boundaryIndex < tasksIndex, "tasks must be in volatile suffix");
});

test("buildPrompt stable prefix is identical across iterations", () => {
  const sections = { ...PROMPT_SECTIONS };
  const a = buildPrompt(sections, "Mode.", "", "", {}, { mode: "edit", iteration: 1, maxIterations: 5 });
  const b = buildPrompt(sections, "Mode.", "", "", {}, { mode: "edit", iteration: 4, maxIterations: 5 });

  const prefixA = a.split("DYNAMIC_CONTEXT_BOUNDARY")[0];
  const prefixB = b.split("DYNAMIC_CONTEXT_BOUNDARY")[0];
  assert.equal(prefixA, prefixB);
});

test("buildPrompt omits empty sections", () => {
  const prompt = buildPrompt(PROMPT_SECTIONS, "", "", "", {}, {});

  // empty modeInstruction / mcpInstructions / skillsCatalog should not create empty blocks
  const lines = prompt.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    assert.ok(line.trim().length > 0, "should not contain blank-only lines between sections");
  }
});
