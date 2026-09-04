import assert from "node:assert/strict";
import test from "node:test";
import { describeAsset, resolveAssetInputType, validateImageBuffer } from "./assets.js";

test("CSV and TSV assets use canonical text MIME types", async () => {
  const csv = await resolveAssetInputType({
    filename: "summary.csv",
    declaredMimeType: "application/octet-stream",
    buffer: Buffer.from("count,sum,mean\n5,66,13.2\n"),
    source: "assistant",
  });
  const tsv = await resolveAssetInputType({
    filename: "summary.tsv",
    declaredMimeType: "text/plain",
    buffer: Buffer.from("count\tsum\n5\t66\n"),
    source: "assistant",
  });

  assert.deepEqual(csv, { kind: "spreadsheet", mimeType: "text/csv" });
  assert.deepEqual(tsv, { kind: "spreadsheet", mimeType: "text/tab-separated-values" });
});

test("generated structured, 3D, archive, and unknown files receive useful artifact types", async () => {
  assert.deepEqual(await resolveAssetInputType({
    filename: "result.json", buffer: Buffer.from('{"ok":true}'), source: "assistant",
  }), { kind: "text", mimeType: "application/json" });
  assert.deepEqual(await resolveAssetInputType({
    filename: "mesh.obj", buffer: Buffer.from("v 0 0 0\nf 1 1 1\n"), source: "assistant",
  }), { kind: "model", mimeType: "model/obj" });
  assert.deepEqual(await resolveAssetInputType({
    filename: "weights.npy", buffer: Buffer.from("custom-binary"), source: "assistant",
  }), { kind: "binary", mimeType: "application/x-npy" });
  assert.deepEqual(await resolveAssetInputType({
    filename: "custom.xyzdata", buffer: Buffer.from([0, 1, 2, 3]), source: "assistant",
  }), { kind: "binary", mimeType: "application/octet-stream" });
});

test("invalid image payloads are rejected before becoming previewable assets", () => {
  const valid = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  assert.doesNotThrow(() => validateImageBuffer(valid, "image/png"));

  const corrupt = Buffer.from(valid);
  corrupt[corrupt.length - 20] ^= 0xff;
  assert.throws(() => validateImageBuffer(corrupt, "image/png"), /Invalid PNG/u);
});

test("a malformed PNG cannot bypass validation through its filename", async () => {
  const malformed = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from("0000000d49484452ffffffffffffffffdeadbeef", "hex"),
    Buffer.alloc(80, 0xde),
  ]);
  const resolved = await resolveAssetInputType({
    filename: "corrupt.png",
    buffer: malformed,
    source: "assistant",
  });
  assert.deepEqual(resolved, { kind: "image", mimeType: "image/png" });
  assert.throws(() => validateImageBuffer(malformed, resolved.mimeType), /Invalid PNG/u);
});

test("asset descriptions expose the resolved MIME type to the agent", () => {
  assert.match(describeAsset({
    id: "asset-1",
    filename: "summary.csv",
    mimeType: "text/csv",
    kind: "spreadsheet",
    source: "assistant",
    size: 29,
    textAvailable: true,
    previewAvailable: false,
  }), /mime=text\/csv/u);
});
