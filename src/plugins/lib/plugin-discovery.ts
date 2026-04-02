import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ModulePlugin, PluginConfigEntry, PluginConfigMap } from "../types.js";
import type { LoadedPlugin } from "./plugin-runtime-types.js";

const pluginsDir = fileURLToPath(new URL("../", import.meta.url));
const entryCandidates = ["index.ts", "index.js", "index.mjs", "index.cjs"];

export async function discoverPluginDirectories(): Promise<string[]> {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const entries = await fsPromises.readdir(pluginsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && name !== "lib")
    .sort((a, b) => a.localeCompare(b));
}

function findEntryFile(directory: string): string | null {
  for (const candidate of entryCandidates) {
    const candidatePath = path.join(pluginsDir, directory, candidate);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }
  return null;
}

function ensureConfigEntry(config: PluginConfigMap, key: string): PluginConfigEntry {
  if (!config[key]) {
    config[key] = { enabled: false, settings: {} };
  }
  if (typeof config[key].enabled !== "boolean") {
    config[key].enabled = false;
  }
  if (!config[key].settings || typeof config[key].settings !== "object" || Array.isArray(config[key].settings)) {
    config[key].settings = {};
  }
  return config[key];
}

function normalizePluginConfig(
  config: PluginConfigMap,
  directory: string,
  pluginName: string,
): { entry: PluginConfigEntry; changed: boolean } {
  let changed = false;
  const existing = config[pluginName] ?? config[directory];

  if (existing && !(pluginName in config)) {
    config[pluginName] = existing;
    changed = true;
  }

  return { entry: ensureConfigEntry(config, pluginName), changed };
}

export async function importPluginModules(
  directories: string[],
  config: PluginConfigMap,
): Promise<{ plugins: LoadedPlugin[]; configChanged: boolean }> {
  const loaded: LoadedPlugin[] = [];
  let configChanged = false;

  for (const directory of directories) {
    if (!(directory in config)) {
      ensureConfigEntry(config, directory);
      configChanged = true;
    }

    const entry = findEntryFile(directory);
    if (!entry) {
      console.warn(
        `Skipping plugin '${directory}': no entry file found (expected one of: ${entryCandidates.join(", ")}).`,
      );
      continue;
    }

    try {
      const imported = await import(pathToFileURL(entry).href);
      const plugin: ModulePlugin = imported?.default ?? imported?.plugin ?? imported;

      if (!plugin || typeof plugin !== "object") {
        console.warn(`Skipping plugin '${directory}': entry file does not export a ModulePlugin.`);
        continue;
      }

      if (typeof plugin.init !== "function") {
        console.warn(`Skipping plugin '${directory}': the exported plugin must provide an 'init' function.`);
        continue;
      }

      const pluginName = plugin.name ?? directory;
      if (loaded.some((item) => item.name === pluginName)) {
        console.warn(`Skipping plugin '${directory}': duplicate plugin name '${pluginName}' encountered.`);
        continue;
      }

      const normalized = normalizePluginConfig(config, directory, pluginName);
      configChanged = configChanged || normalized.changed;

      loaded.push({
        name: pluginName,
        directory,
        entry,
        mod: plugin,
        config: {
          enabled: normalized.entry.enabled,
          settings: { ...normalized.entry.settings },
        },
      });
    } catch (error) {
      console.warn(`Failed to load plugin '${directory}':`, error);
      if (!(directory in config)) {
        ensureConfigEntry(config, directory);
        configChanged = true;
      }
    }
  }

  return { plugins: loaded, configChanged };
}
