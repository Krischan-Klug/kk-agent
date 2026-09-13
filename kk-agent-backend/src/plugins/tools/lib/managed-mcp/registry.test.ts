import assert from "node:assert/strict";
import test from "node:test";
import { buildManagedInternalToolDefinitions, buildManagedMcpConfig, listManagedMcpManifests } from "./registry.js";

test("Context7 is a validated streamable HTTP managed MCP", () => {
  const manifest = listManagedMcpManifests().find((entry) => entry.id === "context7");
  assert.ok(manifest);
  assert.equal(manifest.connection.transport, "streamable-http");
  assert.deepEqual(manifest.allowedTools, ["resolve-library-id", "query-docs"]);

  const tool = buildManagedInternalToolDefinitions().find((entry) => entry.id === "context7");
  assert.ok(tool);
  assert.equal(tool.driver, "mcp");
  assert.match(tool.instruction, /must use Context7 before web search/);
  assert.match(tool.instruction, /Use search or fetch_content only if Context7 is unavailable/);
  assert.match(tool.instruction, /user explicitly asks you to inspect a specific source/);
  const config = buildManagedMcpConfig(tool);
  assert.equal(config?.transport, "streamable-http");
  assert.equal(config?.credentialBindings?.[0]?.required, false);
});

test("web search is a pinned stdio managed MCP", () => {
  const manifest = listManagedMcpManifests().find((entry) => entry.id === "web-search");
  assert.ok(manifest);
  assert.equal(manifest.connection.transport, "stdio");
  assert.deepEqual(manifest.allowedTools, ["search", "fetch_content", "expand_link"]);
  assert.equal(manifest.concurrencySafe, false);
  assert.equal(manifest.connectTimeoutMs, 120_000);

  const tool = buildManagedInternalToolDefinitions().find((entry) => entry.id === "web-search");
  assert.ok(tool);
  assert.equal(tool.driver, "mcp");
  assert.match(tool.instruction, /Use search for discovery and fetch_content/);

  const config = buildManagedMcpConfig(tool);
  assert.equal(config?.transport, "stdio");
  assert.deepEqual(config?.server, {
    command: "uvx",
    args: [
      "--from",
      "duckduckgo-mcp-server[browser]==0.7.0",
      "duckduckgo-mcp-server",
      "--search-backend",
      "curl",
      "--fetch-backend",
      "auto",
      "--parse-mode",
      "markdown",
    ],
    env: {
      DDG_SAFE_SEARCH: "MODERATE",
      DDG_REF_URL_THRESHOLD: "0",
      DDG_ALLOW_PRIVATE_URLS: "0",
      DDG_SSL_VERIFY: "1",
    },
  });
});

test("managed uvx MCPs use the packaged launcher when provided", () => {
  const previous = process.env.KK_AGENT_UVX_PATH;
  process.env.KK_AGENT_UVX_PATH = "C:\\packaged\\uvx.exe";
  try {
    const tool = buildManagedInternalToolDefinitions().find((entry) => entry.id === "web-search");
    assert.ok(tool);
    const config = buildManagedMcpConfig(tool);
    assert.equal(config?.transport, "stdio");
    assert.ok(config && "command" in config.server);
    assert.equal(config?.server.command, "C:\\packaged\\uvx.exe");
  } finally {
    if (previous === undefined) delete process.env.KK_AGENT_UVX_PATH;
    else process.env.KK_AGENT_UVX_PATH = previous;
  }
});
