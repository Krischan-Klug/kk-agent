import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { InternalToolDefinition } from "../../types.js";
import { filesystemDefinition } from "./definition.js";
import { executeSaveAsset } from "./save-asset.js";

function config(basePath: string): InternalToolDefinition {
  return { ...filesystemDefinition, config: { ...filesystemDefinition.config, accessScope: "system", basePath } };
}

test("SaveAsset materializes binary session data byte-for-byte and atomically replaces files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-save-asset-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "image.png");
  await writeFile(path, Buffer.from("old"));
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);

  const result = await executeSaveAsset(
    config(directory),
    { asset_id: "asset-1", file_path: path },
    { sessionId: "session-1", values: {} },
    async (sessionId, assetId) => {
      assert.equal(sessionId, "session-1");
      assert.equal(assetId, "asset-1");
      return { filename: "image.png", data: expected };
    },
  );

  assert.equal(result.isError, false);
  assert.deepEqual(await readFile(path), expected);
  assert.equal(result.metadata?.operation, "replace");
  assert.equal(result.metadata?.bytesWritten, expected.length);
});

test("SaveAsset rejects calls without a session or asset id", async () => {
  const tool = config(tmpdir());
  await assert.rejects(() => executeSaveAsset(tool, { asset_id: "asset-1", file_path: "x.bin" }), /active session/u);
  await assert.rejects(
    () => executeSaveAsset(tool, { file_path: "x.bin" }, { sessionId: "session-1", values: {} }),
    /requires asset_id/u,
  );
});
