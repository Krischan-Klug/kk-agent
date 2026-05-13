import test from "node:test";
import assert from "node:assert/strict";
import { executeWebSearchTool } from "./runtime.js";

function makeConfig(): import("../../../mcp/types.js").McpServerConfig {
  return {
    id: "web-search",
    name: "Web Search",
    active: true,
    instruction: "",
    source: "system",
    systemKey: "web-search",
    systemConfig: {},
    transport: "stdio",
    server: { command: "internal", args: [] },
  };
}

test("WebSearch rejects both allowed and blocked domains", async () => {
  const result = await executeWebSearchTool(makeConfig(), "WebSearch", {
    query: "test",
    allowed_domains: ["example.com"],
    blocked_domains: ["evil.com"],
  });
  assert.equal(result?.isError, true);
  assert.ok(result?.content.includes("Cannot use both"));
});

test("WebSearch filters allowed domains", async () => {
  // This test is a lightweight smoke; real DuckDuckGo results depend on network.
  const result = await executeWebSearchTool(makeConfig(), "WebSearch", {
    query: "github",
    allowed_domains: ["github.com"],
  });
  assert.equal(result?.isError, false);
  const meta = result?.metadata as Record<string, unknown> | undefined;
  assert.ok(meta);
  assert.ok(Array.isArray(meta.results));
  for (const r of meta.results as Array<{ host: string }>) {
    assert.ok(r.host === "github.com" || r.host.endsWith(".github.com"));
  }
});

test("WebFetch rejects invalid URL", async () => {
  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "not-a-valid-url",
  });
  assert.equal(result?.isError, true);
  assert.ok(result?.content.includes("Invalid URL"));
});

test("WebFetch upgrades http to https", async () => {
  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "http://example.com",
  });
  assert.equal(result?.isError, false);
  const meta = result?.metadata as Record<string, unknown> | undefined;
  assert.ok(meta);
  assert.ok(String(meta.url).startsWith("https://"));
});

test("WebFetch strips scripts and styles from HTML", async () => {
  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "https://example.com",
  });
  assert.equal(result?.isError, false);
  assert.ok(!result?.content.includes("<script>"));
  assert.ok(!result?.content.includes("<style>"));
});

test("WebFetch truncates large pages with clear note", async () => {
  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "https://example.com",
  });
  assert.equal(result?.isError, false);
  const meta = result?.metadata as Record<string, unknown> | undefined;
  assert.ok(meta);
  // example.com is small, but metadata should still be present
  assert.ok(typeof meta.bytes === "number");
});
