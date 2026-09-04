import type { CreateMcpBody, McpHttpConfig, McpListItem, McpStdioConfig, McpTransport, UpdateMcpBody } from "kk-agent-contract";

export type JsonParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const MCP_IMPORT_PLACEHOLDER = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\\\data"],
      "env": {}
    }
  }
}`;

export const MCP_IMPORT_HINT =
  'Format: {"mcpServers":{"name":{"command":"...","args":["arg 1","arg 2"],"env":{}}}}. ' +
  'For modern HTTP use {"mcpServers":{"name":{"url":"https://.../mcp","headers":{}}}}. ' +
  'Set "type":"sse" only for legacy SSE servers. Environment and header values are imported as encrypted credentials.';

export const MCP_STDIO_HINT =
  'Format: {"command":"...","args":["arg 1","arg 2"],"env":{"KEY":"value"}}. Each array item is one process argument.';

export const MCP_HTTP_HINT = 'Format: {"url":"https://example.com/mcp","headers":{"X-Non-Secret":"value"}}.';
export const MCP_SSE_HINT = 'Legacy format: {"url":"https://example.com/sse"}.';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(raw: string): JsonParseResult<Record<string, unknown>> {
  if (!raw.trim()) return { ok: false, error: "Paste an MCP configuration as JSON." };
  try {
    const value: unknown = JSON.parse(raw);
    return isObject(value) ? { ok: true, value } : { ok: false, error: "The JSON root must be an object." };
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? error.message : "Invalid JSON." };
  }
}

function readRequiredString(config: Record<string, unknown>, key: string): JsonParseResult<string> {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: `"${key}" must be a non-empty string.` };
  return { ok: true, value: value.trim() };
}

function readArgs(config: Record<string, unknown>): JsonParseResult<string[]> {
  if (config.args === undefined) return { ok: true, value: [] };
  if (!Array.isArray(config.args) || !config.args.every((entry) => typeof entry === "string")) {
    return { ok: false, error: '"args" must be an array of strings.' };
  }
  return { ok: true, value: config.args };
}

function readEnv(config: Record<string, unknown>): JsonParseResult<Record<string, string> | undefined> {
  if (config.env === undefined) return { ok: true, value: undefined };
  if (!isObject(config.env) || !Object.values(config.env).every((entry) => typeof entry === "string")) {
    return { ok: false, error: '"env" must be an object whose values are strings.' };
  }
  return { ok: true, value: config.env as Record<string, string> };
}

function readHeaders(config: Record<string, unknown>): JsonParseResult<Record<string, string> | undefined> {
  if (config.headers === undefined) return { ok: true, value: undefined };
  if (!isObject(config.headers) || !Object.values(config.headers).every((entry) => typeof entry === "string")) {
    return { ok: false, error: '"headers" must be an object whose values are strings.' };
  }
  return { ok: true, value: config.headers as Record<string, string> };
}

function parseStdioServer(config: Record<string, unknown>): JsonParseResult<Pick<UpdateMcpBody, "command" | "args" | "env">> {
  const command = readRequiredString(config, "command");
  if (!command.ok) return { ok: false, error: command.error };
  const args = readArgs(config);
  if (!args.ok) return { ok: false, error: args.error };
  const env = readEnv(config);
  if (!env.ok) return { ok: false, error: env.error };
  return {
    ok: true,
    value: {
      command: command.value,
      args: args.value,
      ...(env.value ? { env: env.value } : {}),
    },
  };
}

function parseHttpServer(config: Record<string, unknown>): JsonParseResult<Pick<UpdateMcpBody, "url" | "headers">> {
  const url = readRequiredString(config, "url");
  if (!url.ok) return { ok: false, error: url.error };
  const headers = readHeaders(config);
  if (!headers.ok) return { ok: false, error: headers.error };
  return { ok: true, value: { url: url.value, ...(headers.value ? { headers: headers.value } : {}) } };
}

export function parseMcpImportJson(raw: string): JsonParseResult<CreateMcpBody> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!isObject(parsed.value.mcpServers)) return { ok: false, error: 'The root must contain an "mcpServers" object.' };

  const entries = Object.entries(parsed.value.mcpServers);
  if (entries.length !== 1) return { ok: false, error: '"mcpServers" must contain exactly one server.' };
  const [name, server] = entries[0];
  if (!name.trim()) return { ok: false, error: "The server name must not be empty." };
  if (!isObject(server)) return { ok: false, error: "The server configuration must be an object." };

  if ("command" in server) {
    const config = parseStdioServer(server);
    return config.ok
      ? { ok: true, value: { name: name.trim(), transport: "stdio", ...config.value } }
      : { ok: false, error: config.error };
  }
  if ("url" in server) {
    const config = parseHttpServer(server);
    const legacySse = server.type === "sse" || server.transport === "sse";
    return config.ok
      ? { ok: true, value: { name: name.trim(), transport: legacySse ? "sse" : "streamable-http", ...config.value } }
      : { ok: false, error: config.error };
  }
  return { ok: false, error: 'The server needs either "command" for stdio or "url" for HTTP.' };
}

export function parseMcpServerJson(
  raw: string,
  transport: McpTransport,
): JsonParseResult<Pick<UpdateMcpBody, "command" | "args" | "env" | "headers" | "url">> {
  const parsed = parseObject(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return transport === "stdio" ? parseStdioServer(parsed.value) : parseHttpServer(parsed.value);
}

export function formatMcpServerJson(mcp: McpListItem): string {
  if (mcp.transport === "stdio") {
    const server = mcp.server as McpStdioConfig;
    return JSON.stringify({ command: server.command, args: server.args, ...(server.env ? { env: server.env } : {}) }, null, 2);
  }
  const server = mcp.server as McpHttpConfig;
  return JSON.stringify({ url: server.url, ...(server.headers ? { headers: server.headers } : {}) }, null, 2);
}
