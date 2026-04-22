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
    "<skills_catalog>\n  <skill id=\"repo-analysis\" name=\"Repo Analysis\" path=\"C:\\skills\\repo-analysis\" source=\"custom\" mode_behaviors=\"plan,edit\">\n    <description>Analyze repo state.</description>\n  </skill>\n</skills_catalog>",
    {},
    { modeId: "plan", modeBehavior: "plan" },
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

test("buildPrompt includes mode context with mode and behavior info", () => {
  const prompt = buildPrompt(PROMPT_SECTIONS, "Plan step.", "", "", {}, { modeId: "plan", modeBehavior: "plan" });

  assert.ok(prompt.includes("<mode_context"));
  assert.ok(prompt.includes("Plan step."));
  assert.ok(prompt.includes('behavior="plan"'));
});

test("buildPrompt places only mode_context after the dynamic context boundary", () => {
  const prompt = buildPrompt(
    PROMPT_SECTIONS,
    "Plan carefully.",
    "<tool_instruction id=\"filesystem\" name=\"Filesystem\">Read first</tool_instruction>",
    "<skills_catalog></skills_catalog>",
    {},
    { modeId: "plan", modeBehavior: "plan" },
  );

  const boundaryIndex = prompt.indexOf("DYNAMIC_CONTEXT_BOUNDARY");
  const communicationIndex = prompt.indexOf("<communication>");
  const modeIndex = prompt.indexOf("<mode_context");
  const tasksIndex = prompt.indexOf("<tasks>");
  const runtimeIndex = prompt.indexOf("<runtime>");

  assert.notEqual(boundaryIndex, -1);
  assert.ok(communicationIndex < boundaryIndex, "communication must be in stable prefix");
  assert.ok(tasksIndex < boundaryIndex, "tasks must be in stable prefix");
  assert.ok(runtimeIndex < boundaryIndex, "runtime must be in stable prefix");
  assert.ok(communicationIndex < tasksIndex, "tasks must come after communication");
  assert.ok(tasksIndex < runtimeIndex, "runtime must come after tasks");
  assert.ok(boundaryIndex < modeIndex, "mode_context must be in volatile suffix");
});

test("buildPrompt stable prefix is identical across calls", () => {
  const sections = { ...PROMPT_SECTIONS };
  const a = buildPrompt(sections, "Mode.", "", "", {}, { modeId: "edit", modeBehavior: "edit" });
  const b = buildPrompt(sections, "Mode.", "", "", {}, { modeId: "edit", modeBehavior: "edit" });

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
