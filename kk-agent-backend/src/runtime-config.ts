import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

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
  if (configured) return isAbsolute(configured) ? configured : resolve(configured);

  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim()
      || join(process.env.USERPROFILE?.trim() || homedir(), "AppData", "Roaming");
    return join(appData, "KK-Agent", "state");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "KK-Agent", "state");
  }
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(dataHome, "kk-agent", "state");
}
