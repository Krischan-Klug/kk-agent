import type { Express } from "express";
import type { PluginPlan } from "./types.js";
import { analysePlugins, discoverPluginDirectories, importPluginModules } from "./lib/plugin-loader.js";
import { initializePlannedPlugins } from "./lib/plugin-bootstrap.js";
import { loadPluginConfig, writePluginConfig } from "./lib/plugin-config.js";

async function preparePlugins() {
  const config = await loadPluginConfig();
  const directories = await discoverPluginDirectories();
  if (directories.length === 0) {
    return { entries: [], registry: {}, staleConfigEntries: Object.keys(config) };
  }

  const { plugins, configChanged: importChanged } = await importPluginModules(directories, config);
  let configChanged = importChanged;
  const validKeys = new Set<string>([...directories, ...plugins.map((plugin) => plugin.name)]);

  for (const key of Object.keys(config)) {
    if (!validKeys.has(key)) {
      delete config[key];
      configChanged = true;
    }
  }

  if (configChanged) {
    try {
      await writePluginConfig(config);
    } catch (error) {
      console.warn("Failed to update plugins.config.json:", error);
    }
  }

  return analysePlugins(plugins, config);
}

export async function planPlugins(): Promise<{
  plan: PluginPlan[];
  staleConfigEntries: string[];
}> {
  const analysis = await preparePlugins();
  return {
    plan: analysis.entries.map((entry) => entry.plan),
    staleConfigEntries: analysis.staleConfigEntries,
  };
}

export default async function initPlugins(app: Express): Promise<void> {
  const analysis = await preparePlugins();
  await initializePlannedPlugins(app, analysis);
}
