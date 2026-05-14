import type { Express } from "express";
import { analysePlugins } from "./lib/plugin-analysis.js";
import { initializePlannedPlugins } from "./lib/plugin-bootstrap.js";
import { internalPluginEntries } from "./internal-registry.js";

async function preparePlugins() {
  const plugins = internalPluginEntries.map(({ directory, plugin }) => {
    const pluginName = plugin.name ?? directory;
    return {
      name: pluginName,
      directory,
      mod: plugin,
    };
  });

  return analysePlugins(plugins);
}

export default async function initPlugins(app: Express): Promise<void> {
  const analysis = await preparePlugins();
  await initializePlannedPlugins(app, analysis);
}
