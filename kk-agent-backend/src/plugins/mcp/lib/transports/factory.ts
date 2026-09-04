import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpHttpConfig, McpServerConfig, McpStdioConfig } from "../../types.js";
import { resolveCredential } from "../credentials.js";

function requiredCredentialError(config: McpServerConfig, label: string): Error {
  return new Error(`MCP "${config.name}" requires credential "${label}".`);
}

function resolveCredentialTargets(
  config: McpServerConfig,
  kind: "env" | "header",
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const binding of config.credentialBindings ?? []) {
    if (binding.target.kind !== kind) continue;
    const secret = resolveCredential(binding.credentialId);
    if (!secret) {
      if (binding.required) throw requiredCredentialError(config, binding.label);
      continue;
    }
    const prefix = binding.target.kind === "header" ? binding.target.prefix ?? "" : "";
    values[binding.target.name] = `${prefix}${secret}`;
  }
  return values;
}

export function buildStdioEnvironment(config: McpServerConfig, server: McpStdioConfig): Record<string, string> | undefined {
  const source = {
    ...getDefaultEnvironment(),
    ...server.env,
    ...resolveCredentialTargets(config, "env"),
  };
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildRequestInit(config: McpServerConfig, server: McpHttpConfig): RequestInit | undefined {
  const headers = {
    ...(server.headers ?? {}),
    ...resolveCredentialTargets(config, "header"),
  };
  return Object.keys(headers).length > 0 ? { headers } : undefined;
}

export function createMcpTransport(config: McpServerConfig): Transport {
  if (config.transport === "stdio") {
    const server = config.server as McpStdioConfig;
    const env = buildStdioEnvironment(config, server);
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      ...(env ? { env } : {}),
    });
  }

  const server = config.server as McpHttpConfig;
  const requestInit = buildRequestInit(config, server);
  if (config.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(
      new URL(server.url),
      requestInit ? { requestInit } : undefined,
    );
  }
  return new SSEClientTransport(
    new URL(server.url),
    requestInit ? { requestInit } : undefined,
  );
}
