import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse } from "node:path";
import test from "node:test";
import { filesystemDefinition } from "./definition.js";
import { resolveFilesystemPath } from "./path-utils.js";

test("filesystem scope rejects a symlink that resolves outside the allowed user root", async (t) => {
  const directory = await mkdtemp(join(homedir(), ".kk-agent-symlink-scope-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const link = join(directory, "escape");
  const outside = process.platform === "win32" ? join(parse(homedir()).root, "Windows") : "/";
  try {
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("Creating symlinks is not permitted on this host.");
      return;
    }
    throw error;
  }
  const config = {
    ...filesystemDefinition,
    config: { ...filesystemDefinition.config, accessScope: "user" as const, basePath: directory },
  };
  await assert.rejects(() => resolveFilesystemPath(config, "escape"), /resolves outside the allowed root/u);
});
