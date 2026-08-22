import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearFilesystemReadState,
  recordKnownContentForSession,
  recordReadForSession,
  verifyReadStateForSession,
} from "./read-state.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "kk-agent-read-state-"));
  const path = join(directory, "fixture.txt");
  const content = "one\ntwo\nthree\nfour\nfive";
  await writeFile(path, content, "utf8");
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return { path, content };
}

async function observe(
  sessionId: string,
  path: string,
  startLine: number,
  endLine: number,
  outputTruncated = false,
) {
  const [info, content] = await Promise.all([stat(path), readFile(path, "utf8")]);
  recordReadForSession(sessionId, path, {
    mtimeMs: info.mtimeMs,
    size: info.size,
    content,
    totalLines: content.split("\n").length,
    startLine,
    endLine,
    outputTruncated,
  });
  return info;
}

test("a later partial read never downgrades verified full-file coverage", async (t) => {
  const sessionId = "full-then-partial";
  t.after(() => clearFilesystemReadState(sessionId));
  const { path } = await fixture(t);
  await observe(sessionId, path, 1, 5);
  const info = await observe(sessionId, path, 4, 5);
  assert.deepEqual(await verifyReadStateForSession(sessionId, path, info.mtimeMs, info.size), { allowed: true });
});

test("multiple partial reads accumulate coverage for the same file version", async (t) => {
  const sessionId = "combined-ranges";
  t.after(() => clearFilesystemReadState(sessionId));
  const { path } = await fixture(t);
  await observe(sessionId, path, 1, 2);
  const info = await observe(sessionId, path, 3, 5);
  assert.deepEqual(await verifyReadStateForSession(sessionId, path, info.mtimeMs, info.size), { allowed: true });
});

test("output truncation never grants full-file edit coverage", async (t) => {
  const sessionId = "truncated";
  t.after(() => clearFilesystemReadState(sessionId));
  const { path } = await fixture(t);
  const info = await observe(sessionId, path, 1, 5, true);
  const result = await verifyReadStateForSession(sessionId, path, info.mtimeMs, info.size);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /not been fully read/);
});

test("content hashes invalidate coverage after an external same-size change", async (t) => {
  const sessionId = "external-change";
  t.after(() => clearFilesystemReadState(sessionId));
  const { path } = await fixture(t);
  await observe(sessionId, path, 1, 5);
  await writeFile(path, "ONE\ntwo\nthree\nfour\nfive", "utf8");
  const info = await stat(path);
  const result = await verifyReadStateForSession(sessionId, path, info.mtimeMs, info.size);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /has changed/);
});

test("a successful harness mutation establishes the new complete baseline", async (t) => {
  const sessionId = "known-mutation";
  t.after(() => clearFilesystemReadState(sessionId));
  const { path } = await fixture(t);
  const content = "updated\ncontent";
  await writeFile(path, content, "utf8");
  const info = await stat(path);
  recordKnownContentForSession(sessionId, path, info.mtimeMs, info.size, content);
  assert.deepEqual(await verifyReadStateForSession(sessionId, path, info.mtimeMs, info.size), { allowed: true });
});
