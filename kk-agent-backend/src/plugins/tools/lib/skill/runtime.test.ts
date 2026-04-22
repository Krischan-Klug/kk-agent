import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initSkillService } from "../../../skills/service.js";
import { initToolsService } from "../../service.js";
import { writeSkillBundle } from "../../../skills/lib/loader.js";
import { executeSkillTool } from "./runtime.js";

test("Skill loads a skill bundle as a hidden meta user message", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-runtime-"));

  try {
    await writeSkillBundle(join(root, "repo-analysis"), {
      name: "Repo Analysis",
      description: "Analyze before changing code.",
      instruction: "Use Read before Edit.",
      metadata: {
        active: true,
        source: "custom",
        recommendedToolIds: ["filesystem"],
        recommendedMcpIds: ["git-inspector"],
        allowedModeBehaviors: ["plan", "edit"],
      },
    });

    const result = await executeSkillTool(
      {} as never,
      "Skill",
      { skill: "repo-analysis" },
      {
        values: {
          availableSkillIds: ["repo-analysis"],
          skillsRootDir: root,
          skillInstructionsById: {
            "repo-analysis": "Use Grep before proposing edits.",
          },
        },
      },
    );

    assert.equal(result?.isError, undefined);
    assert.ok(result?.content.includes('Loaded skill "repo-analysis"'));
    assert.equal(result?.additionalMessages?.length, 1);
    assert.equal(result?.additionalMessages?.[0]?.role, "user");
    assert.equal(result?.additionalMessages?.[0]?.isMeta, true);
    const skillContext = result?.additionalMessages?.[0]?.content[0];
    assert.ok(skillContext && "text" in skillContext);
    assert.ok(skillContext.text.includes("<skill_context"));
    assert.ok(skillContext.text.includes('<tool_ref id="filesystem" />'));
    assert.ok(skillContext.text.includes('<mcp_ref id="git-inspector" />'));
    assert.ok(skillContext.text.includes("Use Grep before proposing edits."));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Skill refuses skills that are not available in the current catalog", async () => {
  const result = await executeSkillTool(
    {} as never,
    "Skill",
    { skill: "missing-skill" },
    { values: { availableSkillIds: [] } },
  );

  assert.equal(result?.isError, true);
  assert.ok(result?.content.includes("not available"));
});

test("Skill does not inject the same skill twice in one conversation context", async () => {
  const result = await executeSkillTool(
    {} as never,
    "Skill",
    { skill: "repo-analysis" },
    {
      values: {
        availableSkillIds: ["repo-analysis"],
        loadedSkillIds: ["repo-analysis"],
      },
    },
  );

  assert.equal(result?.isError, undefined);
  assert.ok(result?.content.includes("already loaded"));
  assert.equal(result?.additionalMessages, undefined);
});

test("CreateSkill writes a new skill bundle without auto-loading it", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-runtime-"));

  try {
    await initToolsService();
    await initSkillService(root);

    const result = await executeSkillTool(
      {} as never,
      "CreateSkill",
      {
        name: "Review Skill",
        description: "Review code for bugs and regressions.",
        instruction: "Read diffs before suggesting changes.",
        allowedModeBehaviors: ["edit", "autonomous"],
        recommendedToolIds: ["skill", "missing-tool"],
      },
      {
        values: {
          skillsRootDir: root,
        },
      },
    );

    assert.equal(result?.isError, undefined);
    assert.ok(result?.content.includes('Created skill "review-skill"'));
    assert.equal(result?.additionalMessages, undefined);

    const markdown = await readFile(join(root, "review-skill", "SKILL.md"), "utf-8");
    assert.ok(markdown.includes("name: Review Skill"));
    assert.ok(markdown.includes("Read diffs before suggesting changes."));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CreateSkill rejects missing required fields", async () => {
  const result = await executeSkillTool(
    {} as never,
    "CreateSkill",
    {
      name: "",
      description: "Missing name should fail.",
      instruction: "Do the thing.",
    },
    { values: {} },
  );

  assert.equal(result?.isError, true);
  assert.ok(result?.content.includes("name is required"));
});
