import type { SecuritySettings } from "kk-agent-contract";
import { loadState, saveState } from "../lib/state.js";

const STATE_FILE = "security.json";
const CODE_DEFAULTS: SecuritySettings = {
  accessScope: "user",
  approvalMode: "ask_approval",
};

let settings: SecuritySettings = { ...CODE_DEFAULTS };

export function normalizeSecuritySettings(value?: Partial<SecuritySettings>): SecuritySettings {
  return {
    accessScope: value?.accessScope === "system" ? "system" : "user",
    approvalMode: value?.approvalMode === "full_access" ? "full_access" : "ask_approval",
  };
}

export async function initSecurityService(): Promise<void> {
  settings = normalizeSecuritySettings(await loadState<Partial<SecuritySettings>>(STATE_FILE, CODE_DEFAULTS));
  await saveState(STATE_FILE, settings);
}

export function getSecuritySettings(): SecuritySettings {
  return { ...settings };
}

export async function updateSecuritySettings(patch: Partial<SecuritySettings>): Promise<SecuritySettings> {
  settings = normalizeSecuritySettings({ ...settings, ...patch });
  await saveState(STATE_FILE, settings);
  return getSecuritySettings();
}
