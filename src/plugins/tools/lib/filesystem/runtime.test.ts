import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { McpServerConfig } from "../../../mcp/types.js";
import { runWithSessionId } from "../user-interaction/interaction-store.js";
import { clearFilesystemReadState } from "./read-state.js";
import { executeFilesystemTool } from "./runtime.js";

function makeConfig(basePath: string): McpServerConfig {
  return {
    id: "filesystem",
    name: "Filesystem",
    active: true,
    instruction: "",
    source: "system",
    systemKey: "filesystem",
    systemConfig: {
      accessScope: "user",
      basePath,
      resultPolicy: {},
    },
    transport: "stdio",
    server: { command: "internal", args: [] },
  };
}

test("Edit requires a prior Read in the same session", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-fs-"));
  const filePath = join(root, "sample.txt");
  await writeFile(filePath, "before", "utf-8");

  try {
    await assert.rejects(
      runWithSessionId("fs-edit-no-read", () =>
        executeFilesystemTool(makeConfig(root), "Edit", {
          file_path: filePath,
          old_string: "before",
          new_string: "after",
        }).then(() => undefined),
      ),
      /Use Read|has changed|has not been read/i,
    );
  } finally {
    clearFilesystemReadState("fs-edit-no-read");
    await rm(root, { recursive: true, force: true });
  }
});

test("Read enables Edit and Write for existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-fs-"));
  const filePath = join(root, "sample.txt");
  await writeFile(filePath, "alpha\nbeta\n", "utf-8");

  try {
    await runWithSessionId("fs-read-edit", async () => {
      const readResult = await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      assert.equal(readResult?.isError, false);

      const editResult = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "beta",
        new_string: "gamma",
      });
      assert.equal(editResult?.isError, false);

      const writeResult = await executeFilesystemTool(makeConfig(root), "Write", {
        file_path: filePath,
        content: "rewritten\n",
      });
      assert.equal(writeResult?.isError, false);
    });

    assert.equal(await readFile(filePath, "utf-8"), "rewritten\n");
  } finally {
    clearFilesystemReadState("fs-read-edit");
    await rm(root, { recursive: true, force: true });
  }
});

test("Glob and Grep expose Claude-style search semantics", async () => {
  const root = await mkdtemp(join(tmpdir(), "kk-agent-fs-"));
  const srcDir = join(root, "src");
  const testDir = join(root, "tests");
  await mkdir(srcDir, { recursive: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(join(srcDir, "index.ts"), "export const TODO = true;\n", "utf-8");
  await writeFile(join(testDir, "index.test.ts"), "TODO should be covered\n", "utf-8");
  await writeFile(join(root, "README.md"), "nothing here\n", "utf-8");

  try {
    await runWithSessionId("fs-search", async () => {
      const globResult = await executeFilesystemTool(makeConfig(root), "Glob", {
        pattern: "**/*.ts",
      });
      assert.ok(globResult?.content.includes("index.ts"));
      assert.ok(globResult?.content.includes("index.test.ts"));

      const grepFiles = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "TODO",
        output_mode: "files_with_matches",
      });
      assert.ok(grepFiles?.content.includes("index.ts"));

      const grepCount = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "TODO",
        output_mode: "count",
      });
      assert.equal(grepCount?.content, "2");
    });
  } finally {
    clearFilesystemReadState("fs-search");
    await rm(root, { recursive: true, force: true });
  }
});
