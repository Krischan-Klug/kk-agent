import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import type { McpServerConfig } from "../../../mcp/types.js";
import { createTempDir } from "../../../../test-helpers.js";
import { runWithSessionId } from "../user-interaction/interaction-store.js";
import { clearFilesystemReadState, getReadStateForSession } from "./read-state.js";
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

test("Edit requires a prior Read in the same session", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "sample.txt");
  await writeFile(filePath, "before", "utf-8");

  try {
    const result = await runWithSessionId("fs-edit-no-read", () =>
      executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "before",
        new_string: "after",
      }),
    );
    assert.equal(result?.isError, true);
    assert.ok(result?.content.match(/Use Read|has changed|has not been read/i));
  } finally {
    clearFilesystemReadState("fs-edit-no-read");
  }
});

test("Read enables Edit and Write for existing files", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
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
  }
});

test("Glob and Grep expose Claude-style search semantics", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
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
  }
});

test("Read returns line ranges and truncation info", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "lines.txt");
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
  await writeFile(filePath, lines.join("\n"), "utf-8");

  try {
    await runWithSessionId("fs-read-range", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Read", {
        file_path: filePath,
        offset: 10,
        limit: 5,
      });
      assert.equal(result?.isError, false);
      assert.ok(result?.content.includes("line 10"));
      assert.ok(result?.content.includes("line 14"));
      assert.ok(!result?.content.includes("line 9"));
      assert.ok(!result?.content.includes("line 15"));
      assert.ok(result?.metadata && (result.metadata as Record<string, unknown>).startLine === 10);
      assert.ok(result?.metadata && (result.metadata as Record<string, unknown>).endLine === 14);
    });
  } finally {
    clearFilesystemReadState("fs-read-range");
  }
});

test("Read beyond EOF returns a reminder with total line count", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "short.txt");
  await writeFile(filePath, "one\ntwo", "utf-8");

  try {
    await runWithSessionId("fs-read-eof", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Read", {
        file_path: filePath,
        offset: 100,
      });
      assert.equal(result?.isError, false);
      assert.ok(result?.content.includes("2 lines"));
      assert.ok(result?.content.includes("offset 100"));
    });
  } finally {
    clearFilesystemReadState("fs-read-eof");
  }
});

test("Read binary file returns helpful error", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "image.png");
  await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]), "utf-8");

  try {
    await runWithSessionId("fs-read-bin", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Read", {
        file_path: filePath,
      });
      assert.equal(result?.isError, true);
      assert.ok(result?.content.includes("image"));
    });
  } finally {
    clearFilesystemReadState("fs-read-bin");
  }
});

test("Read records full and partial read state", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "state.txt");
  await writeFile(filePath, "a\nb\nc\n", "utf-8");

  try {
    await runWithSessionId("fs-read-state", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      const fullState = getReadStateForSession("fs-read-state", filePath);
      assert.equal(fullState?.fullRead, true);

      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath, offset: 1, limit: 1 });
      const partialState = getReadStateForSession("fs-read-state", filePath);
      assert.equal(partialState?.fullRead, false);
      assert.equal(partialState?.offset, 1);
      assert.equal(partialState?.limit, 1);
    });
  } finally {
    clearFilesystemReadState("fs-read-state");
  }
});

test("Edit requires prior full read, not partial", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "edit.txt");
  await writeFile(filePath, "alpha\nbeta\ngamma\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-partial", async () => {
      // Partial read
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath, offset: 1, limit: 1 });
      const state = getReadStateForSession("fs-edit-partial", filePath);
      assert.equal(state?.fullRead, false);

      const editResult = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "beta",
        new_string: "delta",
      });
      assert.equal(editResult?.isError, true);
      assert.ok(editResult?.content.includes("partially read"));
    });
  } finally {
    clearFilesystemReadState("fs-edit-partial");
  }
});

test("Edit fails on stale file", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "stale.txt");
  await writeFile(filePath, "original\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-stale", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      // Mutate file externally
      await writeFile(filePath, "changed\n", "utf-8");
      const editResult = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "original",
        new_string: "updated",
      });
      assert.equal(editResult?.isError, true);
      assert.ok(editResult?.content.includes("changed"));
    });
  } finally {
    clearFilesystemReadState("fs-edit-stale");
  }
});

test("Edit allows mtime-only change if content hash matches", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "mtime.txt");
  await writeFile(filePath, "content\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-mtime", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      // Touch file without changing content
      const now = new Date();
      await utimes(filePath, now, now);

      const editResult = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "content",
        new_string: "updated",
      });
      assert.equal(editResult?.isError, false);
    });
  } finally {
    clearFilesystemReadState("fs-edit-mtime");
  }
});

test("Edit fails on zero or multiple matches", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "multi.txt");
  await writeFile(filePath, "aaa\naaa\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-multi", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });

      const zero = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "zzz",
        new_string: "yyy",
      });
      assert.equal(zero?.isError, true);
      assert.ok(zero?.content.includes("not found"));

      const multi = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "aaa",
        new_string: "bbb",
      });
      assert.equal(multi?.isError, true);
      assert.ok(multi?.content.includes("2 times"));
    });
  } finally {
    clearFilesystemReadState("fs-edit-multi");
  }
});

test("Edit replace_all changes all occurrences", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "replace.txt");
  await writeFile(filePath, "foo bar foo\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-all", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      const result = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "foo",
        new_string: "baz",
        replace_all: true,
      });
      assert.equal(result?.isError, false);
      assert.equal(await readFile(filePath, "utf-8"), "baz bar baz\n");
      assert.ok(result?.metadata && (result.metadata as Record<string, unknown>).occurrences === 2);
    });
  } finally {
    clearFilesystemReadState("fs-edit-all");
  }
});

test("Edit diff contains expected hunks", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "diff.txt");
  await writeFile(filePath, "old line\n", "utf-8");

  try {
    await runWithSessionId("fs-edit-diff", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      const result = await executeFilesystemTool(makeConfig(root), "Edit", {
        file_path: filePath,
        old_string: "old line",
        new_string: "new line",
      });
      assert.equal(result?.isError, false);
      assert.ok(result?.content.includes("---"));
      assert.ok(result?.content.includes("+++"));
      assert.ok(result?.content.includes("-old line"));
      assert.ok(result?.content.includes("+new line"));
    });
  } finally {
    clearFilesystemReadState("fs-edit-diff");
  }
});

test("Write creates new file without prior read", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "new.txt");

  try {
    await runWithSessionId("fs-write-new", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Write", {
        file_path: filePath,
        content: "hello world\n",
      });
      assert.equal(result?.isError, false);
      assert.equal(await readFile(filePath, "utf-8"), "hello world\n");
      assert.ok(result?.metadata && (result.metadata as Record<string, unknown>).operation === "create");
    });
  } finally {
    clearFilesystemReadState("fs-write-new");
  }
});

test("Write to existing file requires read and returns diff", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "existing.txt");
  await writeFile(filePath, "original\n", "utf-8");

  try {
    await runWithSessionId("fs-write-existing", async () => {
      const noRead = await executeFilesystemTool(makeConfig(root), "Write", {
        file_path: filePath,
        content: "updated\n",
      });
      assert.equal(noRead?.isError, true);
      assert.ok(noRead?.content.includes("has not been read"));

      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      const withRead = await executeFilesystemTool(makeConfig(root), "Write", {
        file_path: filePath,
        content: "updated\n",
      });
      assert.equal(withRead?.isError, false);
      assert.ok(withRead?.content.includes("---"));
      assert.ok(withRead?.content.includes("+updated"));
      assert.ok(withRead?.metadata && (withRead.metadata as Record<string, unknown>).operation === "update");
    });
  } finally {
    clearFilesystemReadState("fs-write-existing");
  }
});

test("Write rejects stale existing file", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  const filePath = join(root, "stale-write.txt");
  await writeFile(filePath, "v1\n", "utf-8");

  try {
    await runWithSessionId("fs-write-stale", async () => {
      await executeFilesystemTool(makeConfig(root), "Read", { file_path: filePath });
      await writeFile(filePath, "v2\n", "utf-8");
      const result = await executeFilesystemTool(makeConfig(root), "Write", {
        file_path: filePath,
        content: "v3\n",
      });
      assert.equal(result?.isError, true);
      assert.ok(result?.content.includes("changed"));
    });
  } finally {
    clearFilesystemReadState("fs-write-stale");
  }
});

test("Glob finds expected files and respects limit", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  await writeFile(join(root, "a.ts"), "", "utf-8");
  await writeFile(join(root, "b.ts"), "", "utf-8");
  await writeFile(join(root, "c.js"), "", "utf-8");

  try {
    await runWithSessionId("fs-glob", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Glob", {
        pattern: "*.ts",
      });
      assert.equal(result?.isError, false);
      assert.ok(result?.content.includes("a.ts"));
      assert.ok(result?.content.includes("b.ts"));
      assert.ok(!result?.content.includes("c.js"));
      assert.ok(result?.metadata && (result.metadata as Record<string, unknown>).numFiles === 2);
    });
  } finally {
    clearFilesystemReadState("fs-glob");
  }
});

test("Grep files/content/count modes", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  await writeFile(join(root, "a.ts"), "const x = 1;\n", "utf-8");
  await writeFile(join(root, "b.ts"), "const y = 2;\n", "utf-8");

  try {
    await runWithSessionId("fs-grep-modes", async () => {
      const files = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "const",
        output_mode: "files_with_matches",
      });
      assert.ok(files?.content.includes("a.ts"));
      assert.ok(files?.content.includes("b.ts"));

      const content = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "const",
        output_mode: "content",
      });
      assert.ok(content?.content.includes("a.ts:1:"));
      assert.ok(content?.content.includes("b.ts:1:"));

      const count = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "const",
        output_mode: "count",
      });
      assert.equal(count?.content, "2");
    });
  } finally {
    clearFilesystemReadState("fs-grep-modes");
  }
});

test("Grep offset and head_limit", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  await writeFile(join(root, "lines.ts"), "alpha\nbeta\ngamma\ndelta\n", "utf-8");

  try {
    await runWithSessionId("fs-grep-limit", async () => {
      const result = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "[a-z]+",
        output_mode: "content",
        offset: 1,
        head_limit: 2,
      });
      assert.ok(result?.content.includes(": beta"));
      assert.ok(result?.content.includes(": gamma"));
      assert.ok(!result?.content.includes(": alpha"));
      assert.ok(!result?.content.includes(": delta"));
    });
  } finally {
    clearFilesystemReadState("fs-grep-limit");
  }
});

test("Grep type and glob filters", async (t) => {
  const root = await createTempDir(t, "kk-agent-fs-");
  await writeFile(join(root, "a.ts"), "target\n", "utf-8");
  await writeFile(join(root, "b.js"), "target\n", "utf-8");

  try {
    await runWithSessionId("fs-grep-filter", async () => {
      const typeFilter = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "target",
        output_mode: "files_with_matches",
        type: "ts",
      });
      assert.ok(typeFilter?.content.includes("a.ts"));
      assert.ok(!typeFilter?.content.includes("b.js"));

      const globFilter = await executeFilesystemTool(makeConfig(root), "Grep", {
        pattern: "target",
        output_mode: "files_with_matches",
        glob: "*.js",
      });
      assert.ok(!globFilter?.content.includes("a.ts"));
      assert.ok(globFilter?.content.includes("b.js"));
    });
  } finally {
    clearFilesystemReadState("fs-grep-filter");
  }
});
