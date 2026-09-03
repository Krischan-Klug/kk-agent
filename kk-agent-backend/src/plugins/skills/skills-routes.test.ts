import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { errorMiddleware } from "../../lib/error-middleware.js";
import router from "./skills-routes.js";
import { initSkillService } from "./service.js";

const temporaryRoot = await mkdtemp(join(tmpdir(), "kk-agent-skills-route-test-"));
const app = express();
app.use("/skills", router);
app.use(errorMiddleware);
const server = createServer(app);
let baseUrl = "";

before(async () => {
  await initSkillService(join(temporaryRoot, "managed"), join(temporaryRoot, "workspace"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
  await rm(temporaryRoot, { recursive: true, force: true });
});

test("returns the skill validation reason from the HTTP import endpoint", async () => {
  const form = new FormData();
  form.append("files", new Blob(["Not a valid skill file"]), "SKILL.md");
  form.append("paths", "broken/SKILL.md");

  const response = await fetch(`${baseUrl}/skills/import`, { method: "POST", body: form });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Validation failed: SKILL.md must start with YAML frontmatter.",
  });
});

test("accepts a source folder whose name differs from the canonical skill name", async () => {
  const form = new FormData();
  form.append("files", new Blob([
    "---\nname: unity-mcp-orchestrator\ndescription: Unity MCP test skill\n---\n\nTest body.\n",
  ]), "SKILL.md");
  form.append("paths", "unity-mcp-skill/SKILL.md");

  const response = await fetch(`${baseUrl}/skills/import`, { method: "POST", body: form });
  const body = await response.json() as { skill: { id: string; rootPath: string } };

  assert.equal(response.status, 201);
  assert.equal(body.skill.id, "unity-mcp-orchestrator");
  assert.equal(body.skill.rootPath.endsWith("unity-mcp-orchestrator"), true);
});
