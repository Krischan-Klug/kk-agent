import fsPromises from "node:fs/promises";
import path from "node:path";
import type { PluginConfigMap } from "../types.js";

const CONFIG_FILE = path.resolve(process.cwd(), "plugins.config.json");

async function readJSONFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read JSON file '${filePath}':`, error);
    }
    return null;
  }
}

export async function loadPluginConfig(): Promise<PluginConfigMap> {
  const config = await readJSONFile<PluginConfigMap>(CONFIG_FILE);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
}

export async function writePluginConfig(config: PluginConfigMap): Promise<void> {
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await fsPromises.writeFile(CONFIG_FILE, content, "utf8");
}
