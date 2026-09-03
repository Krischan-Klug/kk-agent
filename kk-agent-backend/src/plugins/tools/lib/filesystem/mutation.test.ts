import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InternalToolDefinition } from "../../types.js";
import { filesystemDefinition } from "./definition.js";
import { executeEdit } from "./edit.js";
import { executeWrite } from "./write.js";

function config(basePath: string): InternalToolDefinition {
  return {
    ...filesystemDefinition,
    config: {
      ...filesystemDefinition.config,
      accessScope: "system",
      basePath,
    },
  };
}

test("Write overwrites an existing text file without a prior Read", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-write-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "existing.txt");
  await writeFile(path, "old\r\ncontent\r\n", "utf8");

  const result = await executeWrite(config(directory), { file_path: path, content: "new\ncontent\n" });

  assert.equal(result.isError, false);
  assert.equal(await readFile(path, "utf8"), "new\r\ncontent\r\n");
  assert.equal(result.metadata?.operation, "update");
  assert.deepEqual((await readdir(directory)).filter((name) => name.includes(".kk-agent-")), []);
});

test("Edit validates exact current text without a prior Read", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-edit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "existing.txt");
  await writeFile(path, "alpha\nbeta\n", "utf8");

  const result = await executeEdit(config(directory), {
    file_path: path,
    old_string: "beta",
    new_string: "gamma",
  });

  assert.equal(result.isError, false);
  assert.equal(await readFile(path, "utf8"), "alpha\ngamma\n");
});

test("concurrent edits of one file are serialized against the latest content", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-concurrent-edit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "existing.txt");
  await writeFile(path, "first\n", "utf8");

  const first = executeEdit(config(directory), {
    file_path: path,
    old_string: "first",
    new_string: "second",
  });
  const second = executeEdit(config(directory), {
    file_path: path,
    old_string: "second",
    new_string: "third",
  });
  const results = await Promise.all([first, second]);

  assert.equal(results.every((result) => result.isError === false), true);
  assert.equal(await readFile(path, "utf8"), "third\n");
});
