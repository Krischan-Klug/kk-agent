import type { InternalToolDefinition, McpCredentialBinding, McpServerConfig } from "kk-agent-contract";
import { hasCredential } from "../../../mcp/lib/credentials.js";
import { MANAGED_MCP_MANIFESTS } from "./definitions/index.js";
import { ManagedMcpManifestSchema, type ManagedMcpManifest } from "./schema.js";

const manifests = MANAGED_MCP_MANIFESTS.map((manifest) => ManagedMcpManifestSchema.parse(manifest));
const manifestsById = new Map(manifests.map((manifest) => [manifest.id, manifest]));

function managedCredentialId(toolId: string, credentialId: string): string {
  return `managed-mcp/${toolId}/${credentialId}`;
}

function buildCredentialBindings(manifest: ManagedMcpManifest): McpCredentialBinding[] {
  return manifest.credentials.map((credential) => ({
    id: credential.id,
    label: credential.label,
    credentialId: managedCredentialId(manifest.id, credential.id),
    required: credential.required,
    target: credential.target,
  }));
}

function resolveStdioCommand(command: string): string {
  if (command !== "uvx") return command;
  return process.env.KK_AGENT_UVX_PATH?.trim() || command;
}

export function listManagedMcpManifests(): ManagedMcpManifest[] {
  return [...manifests];
}

export function getManagedMcpManifest(id: string): ManagedMcpManifest | undefined {
  return manifestsById.get(id);
}

export function buildManagedInternalToolDefinitions(): InternalToolDefinition[] {
  return manifests.map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    active: manifest.active,
    instruction: manifest.instruction,
    emoji: manifest.emoji,
    driver: "mcp",
    config: manifest.resultPolicy ? { resultPolicy: manifest.resultPolicy } : {},
  }));
}

export function buildManagedMcpConfig(tool: InternalToolDefinition): McpServerConfig | undefined {
  const manifest = getManagedMcpManifest(tool.id);
  if (!manifest) return undefined;
  const connection = manifest.connection;
  return {
    id: manifest.id,
    name: tool.name,
    active: tool.active,
    instruction: tool.instruction,
    emoji: tool.emoji,
    transport: connection.transport,
    server: connection.transport === "stdio"
      ? { command: resolveStdioCommand(connection.command), args: connection.args, ...(connection.env ? { env: connection.env } : {}) }
      : { url: connection.url, ...(connection.headers ? { headers: connection.headers } : {}) },
    credentialBindings: buildCredentialBindings(manifest),
    allowedTools: manifest.allowedTools,
    connectTimeoutMs: manifest.connectTimeoutMs,
  };
}

export function getManagedCredentialDescriptors(id: string) {
  const manifest = getManagedMcpManifest(id);
  if (!manifest) return [];
  return manifest.credentials.map((credential) => {
    const credentialId = managedCredentialId(manifest.id, credential.id);
    return {
      id: credential.id,
      label: credential.label,
      description: credential.description,
      required: credential.required,
      configured: hasCredential(credentialId),
      credentialId,
    };
  });
}
