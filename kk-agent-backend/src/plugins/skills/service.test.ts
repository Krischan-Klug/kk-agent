import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { ConflictError, ValidationError } from "../../lib/errors.js";
import { importSkill, initSkillService } from "./service.js";

const temporaryRoots: string[] = [];

async function initializeEmptyService(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-skills-test-"));
  temporaryRoots.push(root);
  await initSkillService(join(root, "managed"), join(root, "workspace"));
}

function skillFile(name: string): Buffer {
  return Buffer.from(`---\nname: ${name}\ndescription: Test skill\n---\n\nFollow the test instructions.\n`);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("imports a valid skill and rejects a duplicate with a conflict", async () => {
  await initializeEmptyService();
  const imported = await importSkill([{ path: "test-skill/SKILL.md", content: skillFile("test-skill") }]);

  assert.equal(imported.skill.id, "test-skill");
  await assert.rejects(
    importSkill([{ path: "test-skill/SKILL.md", content: skillFile("test-skill") }]),
    ConflictError,
  );
});

test("imports a skill when its source folder differs from its canonical name", async () => {
  await initializeEmptyService();
  const imported = await importSkill([{
    path: "unity-mcp-skill/SKILL.md",
    content: skillFile("unity-mcp-orchestrator"),
  }]);

  assert.equal(imported.skill.id, "unity-mcp-orchestrator");
  assert.equal(imported.skill.rootPath.endsWith("unity-mcp-orchestrator"), true);
});

test("reports malformed skill frontmatter as validation failure", async () => {
  await initializeEmptyService();
  const malformed = Buffer.from("---\nname: [\ndescription: Broken\n---\nBody\n");

  await assert.rejects(
    importSkill([{ path: "broken/SKILL.md", content: malformed }]),
    (error: unknown) => error instanceof ValidationError
      && error.message === "Validation failed: SKILL.md frontmatter must contain valid YAML.",
  );
});

test("reports multiple SKILL.md files as validation failure", async () => {
  await initializeEmptyService();

  await assert.rejects(
    importSkill([
      { path: "first/SKILL.md", content: skillFile("first") },
      { path: "second/SKILL.md", content: skillFile("second") },
    ]),
    (error: unknown) => error instanceof ValidationError
      && error.message === "Validation failed: Expected exactly one SKILL.md, found 2.",
  );
});
