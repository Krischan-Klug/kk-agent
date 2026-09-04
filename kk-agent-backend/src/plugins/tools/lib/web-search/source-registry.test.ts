import assert from "node:assert/strict";
import test from "node:test";
import { mergeWebSources, normalizedSourceUrl, resolveRegisteredSource, sourceIdForUrl } from "./source-registry.js";
import type { ToolRuntimeContext } from "../../../loop/types.js";
import type { WebSourceRecord } from "./types.js";

function source(url: string, title: string): WebSourceRecord {
  return {
    id: sourceIdForUrl(url),
    url: normalizedSourceUrl(url),
    host: new URL(url).hostname,
    title,
    provider: "test",
  };
}

test("source IDs are deterministic and ignore tracking parameters and fragments", () => {
  const tracked = "https://Example.com/path?utm_source=x&keep=1#section";
  const clean = "https://example.com/path?keep=1";
  assert.equal(sourceIdForUrl(tracked), sourceIdForUrl(clean));
  assert.equal(normalizedSourceUrl(tracked), clean);
});

test("source registry merges richer records and resolves IDs", () => {
  const context: ToolRuntimeContext = { values: {} };
  const first = source("https://example.com/a", "First");
  const merged = mergeWebSources(context, [first]);
  const enriched = { ...first, title: "Enriched", links: [{ id: "L1", text: "Next", url: "https://example.com/b" }] };
  const final = mergeWebSources(merged, [enriched]);
  assert.deepEqual(resolveRegisteredSource(final, first.id), enriched);
  assert.deepEqual(context.values, {});
});
