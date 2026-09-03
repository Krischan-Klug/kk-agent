import { homedir, platform } from "node:os";
import { parse, resolve } from "node:path";
import type { AccessScope, InternalToolConfig } from "../types.js";

function getUserRootPath(): string {
  return resolve(homedir());
}

function getSystemRootPath(): string {
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

export function resolveFilesystemConfig(config?: InternalToolConfig): InternalToolConfig {
  const accessScope = resolveAccessScope(config?.accessScope);
  const configuredBasePath = config?.basePath?.trim();
  const basePath = resolve(configuredBasePath || getDefaultPathForScope(accessScope));
  return { ...config, accessScope, basePath };
}

export function resolveTerminalConfig(config?: InternalToolConfig): InternalToolConfig {
  const accessScope = resolveAccessScope(config?.accessScope);
  const configuredWorkingDirectory = config?.workingDirectory?.trim();
  const workingDirectory = resolve(configuredWorkingDirectory || getDefaultPathForScope(accessScope));
  return { ...config, accessScope, workingDirectory };
}
