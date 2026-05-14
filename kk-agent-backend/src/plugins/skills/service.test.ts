import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initToolsService } from "../tools/service.js";
import type { SkillDefinition } from "./types.js";
import { DEFAULT_CREATE_SKILL_BODY } from "./lib/default-create-skill.js";
import { buildSkillsCatalogSection } from "./lib/xml.js";
import { createSkill, importSkill, initSkillService, listSkills, updateSkill, updateSkillLinks } from "./service.js";

const BASE_SKILL: SkillDefinition = {
  id: "repo-analysis",
  path: "C:\\skills\\repo-analysis",
  source: "custom",
  name: "Repo Analysis",
  description: "Analyze a repository before making changes.",
  instruction: "Use Read, Glob and Grep before proposing edits.",
  linkedToolIds: [],
  linkedMcpIds: [],
};

test("buildSkillsCatalogSection emits XML without proprietary metadata", () => {
  const xml = buildSkillsCatalogSection([BASE_SKILL]);

  assert.ok(xml.includes("<skills_catalog>"));
  assert.ok(xml.includes('<skill id="repo-analysis"'));
  assert.ok(xml.includes("<description>Analyze a repository before making changes.</description>"));
  assert.ok(!xml.includes("recommended_tools"));
  assert.ok(!xml.includes("recommended_mcps"));
});

test("createSkill writes a standard SKILL.md bundle and updateSkill rewrites it", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const created = await createSkill({
    name: "Repo Analysis",
    description: "Analyze before editing.",
    instruction: "Read first, edit later.",
  });

  assert.equal(created.id, "repo-analysis");
  assert.equal(listSkills().length, 2);

  const skillMarkdown = await readFile(join(root, created.id, "SKILL.md"), "utf-8");
  const skillLinks = await readFile(join(root, created.id, "agents", "kk-agent.json"), "utf-8");
  assert.ok(skillMarkdown.includes("name: Repo Analysis"));
  assert.ok(skillMarkdown.includes("description: Analyze before editing."));
  assert.ok(skillMarkdown.includes("Read first, edit later."));
  assert.equal(skillLinks, ["{", '  "toolIds": [],', '  "mcpIds": []', "}"].join("\n"));

  const updated = await updateSkill(created.id, {
    description: "Updated description.",
    instruction: "Use Glob and Grep too.",
  });

  assert.equal(updated.description, "Updated description.");

  const updatedMarkdown = await readFile(join(root, created.id, "SKILL.md"), "utf-8");
  assert.ok(updatedMarkdown.includes("description: Updated description."));
  assert.ok(updatedMarkdown.includes("Use Glob and Grep too."));
});

test("updateSkillLinks writes sanitized kk-agent link metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const created = await createSkill({
    name: "Repo Analysis",
    description: "Analyze before editing.",
    instruction: "Read first, edit later.",
  });

  const updated = await updateSkillLinks(created.id, {
    toolIds: ["filesystem", "filesystem", "missing-tool"],
    mcpIds: ["missing-mcp"],
  });

  assert.deepEqual(updated.linkedToolIds, ["filesystem"]);
  assert.deepEqual(updated.linkedMcpIds, []);

  const skillLinks = await readFile(join(root, created.id, "agents", "kk-agent.json"), "utf-8");
  assert.equal(skillLinks, ["{", '  "toolIds": [', '    "filesystem"', "  ],", '  "mcpIds": []', "}"].join("\n"));
});

test("importSkill installs a standard skill bundle from uploaded files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const imported = await importSkill([
    {
      path: "openai-docs/SKILL.md",
      content: Buffer.from(
        [
          "---",
          "name: openai-docs",
          "description: Use when the user asks about OpenAI docs.",
          "---",
          "",
          "Search the docs first.",
          "",
        ].join("\n"),
        "utf-8",
      ),
    },
    {
      path: "openai-docs/references/latest-model.md",
      content: Buffer.from("latest model fallback", "utf-8"),
    },
  ]);

  assert.equal(imported.skill.id, "openai-docs");
  assert.equal(imported.skill.name, "openai-docs");
  assert.equal(imported.skill.description, "Use when the user asks about OpenAI docs.");

  const importedMarkdown = await readFile(join(root, "openai-docs", "SKILL.md"), "utf-8");
  const importedLinks = await readFile(join(root, "openai-docs", "agents", "kk-agent.json"), "utf-8");
  assert.ok(importedMarkdown.includes("name: openai-docs"));
  assert.ok(importedMarkdown.includes("Search the docs first."));
  assert.equal(importedLinks, ["{", '  "toolIds": [],', '  "mcpIds": []', "}"].join("\n"));
});

test("initSkillService seeds only the current default create-skill and preserves custom edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-service-"));
  await initToolsService();
  await initSkillService(root);

  const seeded = listSkills().find((skill) => skill.id === "create-skill");
  assert.ok(seeded);
  assert.equal(seeded?.description, DEFAULT_CREATE_SKILL_BODY.description);
  assert.equal(seeded?.instruction, DEFAULT_CREATE_SKILL_BODY.instruction);

  const seedPath = join(root, "create-skill", "SKILL.md");
  await writeFile(seedPath, "---\nname: Create Skill\ndescription: Custom seeded description.\n---\n\nKeep this custom body.\n", "utf-8");

  await initSkillService(root);

  const persisted = listSkills().find((skill) => skill.id === "create-skill");
  assert.equal(persisted?.description, "Custom seeded description.");
  assert.equal(persisted?.instruction, "Keep this custom body.");
});
