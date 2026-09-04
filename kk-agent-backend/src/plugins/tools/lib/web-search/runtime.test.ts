import assert from "node:assert/strict";
import test from "node:test";
import { webSearchDefinition } from "./definition.js";
import { clearWebCachesForTests, executeWebSearchTool } from "./runtime.js";

test.beforeEach(() => clearWebCachesForTests());

test("WebSearch rejects missing and oversized queries without network access", async () => {
  const missing = await executeWebSearchTool(webSearchDefinition, "WebSearch", {});
  assert.equal(missing?.isError, true);
  assert.equal(missing?.metadata?.errorKind, "invalid_input");

  const oversized = await executeWebSearchTool(webSearchDefinition, "WebSearch", { query: "x".repeat(1_001) });
  assert.equal(oversized?.isError, true);
  assert.equal(oversized?.metadata?.errorKind, "invalid_input");
});

test("WebOpen blocks private network targets and classifies the error", async () => {
  const result = await executeWebSearchTool(webSearchDefinition, "WebOpen", { url: "http://127.0.0.1/private" });
  assert.equal(result?.isError, true);
  assert.equal(result?.metadata?.errorKind, "blocked_address");
});

test("WebOpen requires a known source ID and WebFind requires a pattern", async () => {
  const unknown = await executeWebSearchTool(webSearchDefinition, "WebOpen", { source_id: "src_unknown" }, { values: {} });
  assert.equal(unknown?.isError, true);
  assert.match(unknown?.content ?? "", /Unknown source_id/u);

  const missingPattern = await executeWebSearchTool(webSearchDefinition, "WebFind", { url: "https://example.com" });
  assert.equal(missingPattern?.isError, true);
  assert.match(missingPattern?.content ?? "", /pattern is required/u);
});

test("unknown web tool names are ignored", async () => {
  assert.equal(await executeWebSearchTool(webSearchDefinition, "OtherTool", {}), null);
});
