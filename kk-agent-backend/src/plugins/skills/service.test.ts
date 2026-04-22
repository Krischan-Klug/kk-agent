import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initToolsService } from "../tools/service.js";
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
  await initToolsService();
  await initSkillService(root);

  const created = await createSkill({
    name: "Repo Analysis",
    description: "Analyze before editing.",
    instruction: "Read first, edit later.",
    active: true,
    allowedModes: ["plan"],
  });

  assert.equal(created.id, "repo-analysis");
  assert.equal(listSkills().length, 2);

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

test("createSkill sanitizes ids, preserves autonomous mode, and generates unique slugs", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const first = await createSkill({
    name: "Skill Builder",
    description: "Create skills.",
    instruction: "Ask only focused follow-up questions.",
    allowedModes: ["autonomous"],
    recommendedToolIds: ["skill", "missing-tool"],
    recommendedMcpIds: ["missing-mcp"],
  });
  const second = await createSkill({
    name: "Skill Builder",
    description: "Create skills again.",
    instruction: "Write lean instructions.",
  });

  assert.equal(first.id, "skill-builder");
  assert.equal(second.id, "skill-builder-2");
  assert.deepEqual(first.allowedModes, ["autonomous"]);
  assert.deepEqual(first.recommendedToolIds, ["skill"]);
  assert.deepEqual(first.recommendedMcpIds, []);
});

test("initSkillService seeds create-skill once and does not overwrite it", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const seeded = listSkills().find((skill) => skill.id === "create-skill");
  assert.ok(seeded);
  assert.deepEqual(seeded?.allowedModes, ["plan", "edit"]);
  assert.equal(seeded?.recommendedToolIds.join(","), "skill,user-interaction");
  assert.match(seeded?.description ?? "", /KK-Agent skill bundle|state\/skills/i);
  assert.match(seeded?.instruction ?? "", /load `create-skill` with Skill before you ask follow-up questions, draft content, or call CreateSkill/i);
  assert.match(seeded?.instruction ?? "", /always use CreateSkill/i);
  assert.match(seeded?.instruction ?? "", /Do not manually write SKILL\.md or kk-agent\.skill\.json/i);
  assert.match(seeded?.instruction ?? "", /YAML frontmatter/i);
  assert.match(seeded?.instruction ?? "", /name: Repo Analysis/);
  assert.match(seeded?.instruction ?? "", /Do not encode trigger lists as `Trigger:` mini-syntax/i);
  assert.match(seeded?.instruction ?? "", /"allowedModes": \["plan", "edit"\]/);
  assert.match(seeded?.instruction ?? "", /allowedModes to plan and edit/i);
  assert.match(seeded?.instruction ?? "", /ask_user/);
  assert.match(seeded?.instruction ?? "", /multiple choice/i);
  assert.match(seeded?.instruction ?? "", /Do not model timers, schedules, background jobs/i);

  const seedPath = join(root, "create-skill", "SKILL.md");
  await writeFile(seedPath, "---\nname: Create Skill\ndescription: Custom seeded description.\n---\n\nKeep this custom body.\n", "utf-8");

  await initSkillService(root);

  const persisted = listSkills().find((skill) => skill.id === "create-skill");
  assert.equal(persisted?.description, "Custom seeded description.");
  assert.equal(persisted?.instruction, "Keep this custom body.");
});
