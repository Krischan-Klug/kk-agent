import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkillFromPath } from "./loader.js";

async function createSkillBundle(root: string, name: string, body = "Do the thing.") {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Test skill",
      "---",
      "",
      body,
      "",
    ].join("\n"),
    "utf-8",
  );
  return dir;
}

test("loadSkillFromPath loads valid SKILL.md metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-loader-"));
  await createSkillBundle(root, "demo-skill", "Use this skill carefully.");

  const loaded = await loadSkillFromPath(root, "demo-skill");

  assert.equal(loaded.name, "demo-skill");
  assert.equal(loaded.description, "Test skill");
  assert.equal(loaded.instruction, "Use this skill carefully.");
  assert.deepEqual(loaded.links, { linkedToolIds: [], linkedMcpIds: [] });
  assert.ok(loaded.skillFilePath.endsWith("SKILL.md"));
});

test("loadSkillFromPath loads kk-agent tool and mcp links from overlay metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-loader-"));
  const skillDir = await createSkillBundle(root, "linked-skill", "Use linked capabilities.");
  await mkdir(join(skillDir, "agents"), { recursive: true });
  await writeFile(
    join(skillDir, "agents", "kk-agent.json"),
    JSON.stringify({ toolIds: ["filesystem", "filesystem"], mcpIds: ["github"] }, null, 2),
    "utf-8",
  );

  const loaded = await loadSkillFromPath(root, "linked-skill");

  assert.deepEqual(loaded.links, {
    linkedToolIds: ["filesystem"],
    linkedMcpIds: ["github"],
  });
});

test("loadSkillFromPath rejects missing description frontmatter", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-loader-"));
  const dir = join(root, "broken-skill");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    ["---", "name: broken", "---", "", "Instruction body"].join("\n"),
    "utf-8",
  );

  await assert.rejects(
    () => loadSkillFromPath(root, "broken-skill"),
    /description/i,
  );
});

test("loadSkillFromPath rejects multiple SKILL.md files in one bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-loader-"));
  const dir = await createSkillBundle(root, "duplicate-skill");
  const nested = join(dir, "nested");
  await mkdir(nested, { recursive: true });
  await writeFile(
    join(nested, "skill.md"),
    ["---", "name: nested", "description: nested", "---", "", "Nested body"].join("\n"),
    "utf-8",
  );

  await assert.rejects(
    () => loadSkillFromPath(root, "duplicate-skill"),
    /exactly one/i,
  );
});

test("loadSkillFromPath rejects paths outside the configured root", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skill-loader-"));

  await assert.rejects(
    () => loadSkillFromPath(root, ".."),
    /within root directory/i,
  );
});
