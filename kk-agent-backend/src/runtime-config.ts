import { resolve } from "node:path";

const DEFAULT_PORT = 3001;

export function resolvePort(rawPort: string | undefined, fallback = DEFAULT_PORT): number {
  if (rawPort === undefined || rawPort.trim() === "") return fallback;

  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value "${rawPort}". Expected an integer between 0 and 65535.`);
  }

  return parsed;
}

export function resolveStateDir(): string {
  const configured = process.env.KK_AGENT_STATE_DIR?.trim();
  return resolve(configured || "state");
}

export function resolvePluginConfigFile(): string {
  const configured = process.env.KK_AGENT_PLUGIN_CONFIG_FILE?.trim();
  return resolve(configured || "plugins.config.json");
}
