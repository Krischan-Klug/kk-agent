import type { Express } from "express";
import { analysePlugins } from "./lib/plugin-analysis.js";
import { initializePlannedPlugins } from "./lib/plugin-bootstrap.js";
import { loadPluginConfig, writePluginConfig } from "./lib/plugin-config.js";
import { internalPluginEntries } from "./internal-registry.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("plugins");

async function preparePlugins() {
  const config = await loadPluginConfig();
  const directories = internalPluginEntries.map((entry) => entry.directory);
  let configChanged = false;
  if (directories.length === 0) {
    return { entries: [], registry: {}, staleConfigEntries: Object.keys(config) };
  }

  const plugins = internalPluginEntries.map(({ directory, plugin }) => {
    if (!(directory in config)) {
      config[directory] = { enabled: false, settings: {} };
      configChanged = true;
    }

    const pluginName = plugin.name ?? directory;
    const existing = config[pluginName] ?? config[directory];
    if (!(pluginName in config)) {
      config[pluginName] = existing;
      configChanged = true;
    }

    if (typeof config[pluginName]?.enabled !== "boolean") {
      config[pluginName]!.enabled = false;
      configChanged = true;
    }
    if (!config[pluginName]?.settings || typeof config[pluginName]?.settings !== "object" || Array.isArray(config[pluginName]?.settings)) {
      config[pluginName]!.settings = {};
      configChanged = true;
    }

    return {
      name: pluginName,
      directory,
      mod: plugin,
      config: {
        enabled: config[pluginName]!.enabled,
        settings: { ...config[pluginName]!.settings },
      },
    };
  });
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
      logger.warn("Failed to update plugins.config.json:", error);
    }
  }

  return analysePlugins(plugins, config);
}

export default async function initPlugins(app: Express): Promise<void> {
  const analysis = await preparePlugins();
  await initializePlannedPlugins(app, analysis);
}
