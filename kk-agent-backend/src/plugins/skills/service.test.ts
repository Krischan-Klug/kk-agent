import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SkillDefinition } from "./types.js";
import { buildSkillCatalogSection, createSkill, initSkillService, listSkills, updateSkill } from "./service.js";

const BASE_SKILL: SkillDefinition = {
  id: "repo-analysis",
  path: "C:\\skills\\repo-analysis",
  active: true,
  source: "custom",
  recommendedToolIds: ["filesystem"],
  recommendedMcpIds: ["git-inspector"],
  allowedModes: ["plan", "edit"],
  name: "Repo Analysis",
  description: "Analyze a repository before making changes.",
  instruction: "Use Read, Glob and Grep before proposing edits.",
};

test("buildSkillCatalogSection emits metadata XML with tool and mcp references", () => {
  const xml = buildSkillCatalogSection([BASE_SKILL]);

  assert.ok(xml.includes("<skills_catalog>"));
  assert.ok(xml.includes('<skill id="repo-analysis"'));
  assert.ok(xml.includes("<recommended_tools>"));
  assert.ok(xml.includes('<tool_ref id="filesystem" />'));
  assert.ok(xml.includes("<recommended_mcps>"));
  assert.ok(xml.includes('<mcp_ref id="git-inspector" />'));
  assert.ok(!xml.includes("Use Read, Glob and Grep before proposing edits."));
});

test("createSkill writes a bundle into the skills state directory and updateSkill rewrites SKILL.md", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initSkillService(root);

  const created = await createSkill({
    name: "Repo Analysis",
    description: "Analyze before editing.",
    instruction: "Read first, edit later.",
    active: true,
    allowedModes: ["plan"],
  });

  assert.equal(created.id, "repo-analysis");
  assert.equal(listSkills().length, 1);

  const skillMarkdown = await readFile(join(root, created.id, "SKILL.md"), "utf-8");
  assert.ok(skillMarkdown.includes("name: Repo Analysis"));
  assert.ok(skillMarkdown.includes("description: Analyze before editing."));
  assert.ok(skillMarkdown.includes("Read first, edit later."));

  const updated = await updateSkill(created.id, {
    description: "Updated description.",
    instruction: "Use Glob and Grep too.",
    allowedModes: ["plan", "edit"],
  });

  assert.equal(updated.description, "Updated description.");
  assert.equal(updated.allowedModes.join(","), "plan,edit");

  const updatedMarkdown = await readFile(join(root, created.id, "SKILL.md"), "utf-8");
  assert.ok(updatedMarkdown.includes("description: Updated description."));
  assert.ok(updatedMarkdown.includes("Use Glob and Grep too."));
});
