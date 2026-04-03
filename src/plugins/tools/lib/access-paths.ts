import { homedir, platform } from "node:os";
import { parse, resolve } from "node:path";
import type { AccessScope, SystemMcpConfig } from "../../mcp/types.js";

export function getUserRootPath(): string {
  return resolve(homedir());
}

export function getSystemRootPath(): string {
  if (platform() === "win32") {
    const parsed = parse(getUserRootPath());
    return parsed.root || "C:\\";
  }
  return "/";
}

export function getDefaultPathForScope(scope: AccessScope = "user"): string {
  return scope === "system" ? getSystemRootPath() : getUserRootPath();
}

export function resolveAccessScope(scope?: AccessScope): AccessScope {
  return scope === "system" ? "system" : "user";
}

export function resolveFilesystemSystemConfig(config?: SystemMcpConfig): SystemMcpConfig {
  const accessScope = resolveAccessScope(config?.accessScope);
  const configuredBasePath = config?.basePath?.trim();
  const basePath = resolve(configuredBasePath || getDefaultPathForScope(accessScope));
  return { ...config, accessScope, basePath };
}

export function resolveTerminalSystemConfig(config?: SystemMcpConfig): SystemMcpConfig {
  const accessScope = resolveAccessScope(config?.accessScope);
  const configuredWorkingDirectory = config?.workingDirectory?.trim();
  const workingDirectory = resolve(configuredWorkingDirectory || getDefaultPathForScope(accessScope));
  return { ...config, accessScope, workingDirectory };
}

export function getTerminalElevationLabel(scope?: AccessScope): "normal" | "elevated" {
  return resolveAccessScope(scope) === "system" ? "elevated" : "normal";
}
