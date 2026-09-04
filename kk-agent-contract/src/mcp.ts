export interface McpStdioConfig {
  command: string;
  args: string[];
  /** Non-secret process configuration only. Credentials use credentialBindings. */
  env?: Record<string, string>;
}

export interface McpHttpConfig {
  url: string;
  /** Non-secret request headers only. Credentials use credentialBindings. */
  headers?: Record<string, string>;
}

export type McpSseConfig = McpHttpConfig;

export type McpTransport = "stdio" | "streamable-http" | "sse";

export type McpCredentialTarget =
  | { kind: "env"; name: string }
  | { kind: "header"; name: string; prefix?: string };

export interface McpCredentialBinding {
  id: string;
  label: string;
  credentialId: string;
  required: boolean;
  target: McpCredentialTarget;
}

export interface CredentialStatus {
  id: string;
  label: string;
  required: boolean;
  configured: boolean;
}

export interface McpServerConfig {
  id: string;
  name: string;
  active: boolean;
  instruction: string;
  emoji?: string;
  transport: McpTransport;
  server: McpStdioConfig | McpHttpConfig;
  credentialBindings?: McpCredentialBinding[];
  allowedTools?: string[];
  connectTimeoutMs?: number;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mcpId: string;
}

export type McpRuntimeStatus = "running" | "stopped" | "unavailable";

export interface McpRuntimeState {
  status: McpRuntimeStatus;
  error?: string;
}

export interface McpListItem extends McpServerConfig {
  runtime: McpRuntimeState;
  tools: McpToolDefinition[];
  credentials: CredentialStatus[];
}

export interface CreateMcpBody {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  url?: string;
  credentialBindings?: McpCredentialBinding[];
  instruction?: string;
  emoji?: string;
}

export interface UpdateMcpBody {
  name?: string;
  active?: boolean;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  url?: string;
  credentialBindings?: McpCredentialBinding[];
  instruction?: string;
  emoji?: string;
}
