import type { McpServerConfig } from "../types.js";
import { ValidationError } from "../../../lib/errors.js";

export function validateMcpConfig(config: McpServerConfig): void {
  const expectedTarget = config.transport === "stdio" ? "env" : "header";
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const binding of config.credentialBindings ?? []) {
    if (ids.has(binding.id)) throw new ValidationError(`Duplicate MCP credential binding id "${binding.id}".`);
    ids.add(binding.id);
    if (binding.target.kind !== expectedTarget) {
      throw new ValidationError(`${config.transport} credentials must target ${expectedTarget}.`);
    }
    const target = `${binding.target.kind}:${binding.target.name.toLowerCase()}`;
    if (targets.has(target)) throw new ValidationError(`Duplicate MCP credential target "${binding.target.name}".`);
    targets.add(target);
  }
}
