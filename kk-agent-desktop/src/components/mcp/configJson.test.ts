import assert from "node:assert/strict";
import test from "node:test";
import { parseMcpImportJson } from "./configJson";

test("remote MCP imports default to modern streamable HTTP", () => {
  const result = parseMcpImportJson(JSON.stringify({
    mcpServers: { docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer secret" } } },
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.transport, "streamable-http");
    assert.equal(result.value.headers?.Authorization, "Bearer secret");
  }
});

test("legacy SSE must be selected explicitly", () => {
  const result = parseMcpImportJson(JSON.stringify({
    mcpServers: { legacy: { type: "sse", url: "https://example.com/sse" } },
  }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.transport, "sse");
});
