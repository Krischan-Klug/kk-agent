import path from "node:path";
import type { PluginConfigMap } from "../types.js";
import { readJsonFile, writeJsonFile } from "./state.js";

const CONFIG_FILE = path.resolve(process.cwd(), "plugins.config.json");

export async function loadPluginConfig(): Promise<PluginConfigMap> {
  const config = await readJsonFile<PluginConfigMap>(CONFIG_FILE);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
}

export async function writePluginConfig(config: PluginConfigMap): Promise<void> {
  await writeJsonFile(CONFIG_FILE, config, { trailingNewline: true });
}
