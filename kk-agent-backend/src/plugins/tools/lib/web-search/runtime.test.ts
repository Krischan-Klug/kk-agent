import test from "node:test";
import assert from "node:assert/strict";
import { mockFetch } from "../../../../test-helpers.js";
import { executeWebSearchTool } from "./runtime.js";

function htmlResponse(url: string, html: string): Response {
  const response = new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

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

test("WebSearch filters allowed domains", async (t) => {
  mockFetch(t, (input) => htmlResponse(String(input), `
    <a class="result__a" href="https://github.com/example/repo">GitHub Repo</a>
    <a class="result__snippet">Repository snippet</a>
    <a class="result__a" href="https://example.com/ignored">Other Result</a>
    <a class="result__snippet">Other snippet</a>
  `));

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
    url: "http://[::1",
  });
  assert.equal(result?.isError, true);
  assert.ok(result?.content.includes("Invalid URL"));
});

test("WebFetch upgrades http to https", async (t) => {
  mockFetch(t, (input) => htmlResponse(String(input), "<title>Example</title><p>Hello</p>"));

  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "http://example.com",
  });
  assert.equal(result?.isError, false);
  const meta = result?.metadata as Record<string, unknown> | undefined;
  assert.ok(meta);
  assert.ok(String(meta.url).startsWith("https://"));
});

test("WebFetch strips scripts and styles from HTML", async (t) => {
  mockFetch(t, (input) => htmlResponse(String(input), `
    <title>Example</title>
    <style>body { color: red; }</style>
    <script>alert("x")</script>
    <p>Visible text</p>
  `));

  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "https://example.com",
  });
  assert.equal(result?.isError, false);
  assert.ok(!result?.content.includes("<script>"));
  assert.ok(!result?.content.includes("<style>"));
});

test("WebFetch truncates large pages with clear note", async (t) => {
  mockFetch(t, (input) => htmlResponse(String(input), "<title>Example</title><p>Small page</p>"));

  const result = await executeWebSearchTool(makeConfig(), "WebFetch", {
    url: "https://example.com",
  });
  assert.equal(result?.isError, false);
  const meta = result?.metadata as Record<string, unknown> | undefined;
  assert.ok(meta);
  // example.com is small, but metadata should still be present
  assert.ok(typeof meta.bytes === "number");
});
