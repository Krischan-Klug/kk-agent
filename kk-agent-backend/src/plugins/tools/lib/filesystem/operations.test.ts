import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import test from "node:test";
import type { InternalToolDefinition } from "../../types.js";
import { filesystemDefinition } from "./definition.js";
import {
  executeCopy,
  executeList,
  executeMkdir,
  executeMove,
  executeRemove,
  executeStat,
} from "./operations.js";

function config(basePath: string): InternalToolDefinition {
  return { ...filesystemDefinition, config: { ...filesystemDefinition.config, accessScope: "system", basePath } };
}

test("filesystem structural operations list, stat, create, and move without a shell", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-filesystem-operations-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tool = config(directory);
  await executeMkdir(tool, { path: "nested/child" });
  await writeFile(join(directory, "nested", "source.txt"), "content", "utf8");

  const listing = await executeList(tool, { path: "nested" });
  assert.match(listing.content, /child\//u);
  assert.match(listing.content, /source\.txt/u);
  const inspected = await executeStat(tool, { path: "nested/source.txt" });
  assert.match(inspected.content, /Type: file/u);
  assert.match(inspected.content, /Size: 7 bytes/u);

  await executeMove(tool, { source: "nested/source.txt", destination: "moved/result.txt" });
  assert.equal(await readFile(join(directory, "moved", "result.txt"), "utf8"), "content");
});

test("filesystem copies and removes files and directory trees without a shell", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-filesystem-copy-remove-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tool = config(directory);
  await mkdir(join(directory, "source", "nested"), { recursive: true });
  await writeFile(join(directory, "source", "nested", "data.txt"), "copy me", "utf8");

  await executeCopy(tool, { source: "source", destination: "copy", recursive: true });
  assert.equal(await readFile(join(directory, "copy", "nested", "data.txt"), "utf8"), "copy me");
  await assert.rejects(
    () => executeCopy(tool, { source: "source", destination: "source/inside", recursive: true }),
    /cannot be copied into itself/u,
  );

  await executeRemove(tool, { path: "copy", recursive: true });
  await assert.rejects(() => lstat(join(directory, "copy")), { code: "ENOENT" });
  await assert.rejects(
    () => executeRemove(tool, { path: parse(directory).root, recursive: true }),
    /root.*not allowed/u,
  );
});

test("filesystem removal removes a symbolic link instead of its target", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-filesystem-remove-link-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, "target");
  const link = join(directory, "link");
  await mkdir(target);
  await writeFile(join(target, "keep.txt"), "keep", "utf8");
  try {
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("Creating symlinks is not permitted on this host.");
      return;
    }
    throw error;
  }

  await executeRemove(config(directory), { path: link });
  assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "keep");
  await assert.rejects(() => lstat(link), { code: "ENOENT" });
});
