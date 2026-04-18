import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";
import type {
  ModulePlugin,
  PluginConfigEntry,
  PluginConfigMap,
  PluginDependency,
  PluginPlan,
  PluginSummary,
} from "../types.js";

export interface LoadedPlugin {
  name: string;
  directory: string;
  entry: string;
  mod: ModulePlugin;
  config: PluginConfigEntry;
}

export interface PluginAnalysisEntry {
  info: LoadedPlugin;
  plan: PluginPlan;
}

export interface PluginAnalysis {
  entries: PluginAnalysisEntry[];
  registry: Record<string, PluginSummary>;
  staleConfigEntries: string[];
}

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

function createRegistry(plugins: LoadedPlugin[]): Record<string, PluginSummary> {
  const registry: Record<string, PluginSummary> = {};
  for (const plugin of plugins) {
    registry[plugin.name] = {
      name: plugin.name,
      version: plugin.mod.version ?? "0.0.0",
      description: plugin.mod.description,
    };
  }
  return registry;
}

function topologicalOrder(plugins: LoadedPlugin[]): string[] {
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pluginsMap = new Map<string, LoadedPlugin>(plugins.map((plugin) => [plugin.name, plugin]));

  function visit(name: string, stack: string[] = []): void {
    if (visited.has(name)) return;

    if (visiting.has(name)) {
      throw new Error(`Circular plugin dependency detected: ${[...stack, name].join(" -> ")}`);
    }

    const plugin = pluginsMap.get(name);
    if (!plugin) return;

    visiting.add(name);
    for (const dependency of plugin.mod.deps ?? []) {
      if (dependency?.name && pluginsMap.has(dependency.name)) {
        visit(dependency.name, [...stack, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const plugin of plugins) {
    visit(plugin.name);
  }

  return order;
}

function satisfyDependency(
  dependency: PluginDependency,
  registry: Record<string, PluginSummary>,
  planMap: Map<string, PluginPlan>,
): { ok: boolean; reason?: string } {
  const summary = registry[dependency.name];
  if (!summary) {
    return { ok: false, reason: `Missing dependency '${dependency.name}'.` };
  }

  const depPlan = planMap.get(dependency.name);
  if (!depPlan || depPlan.status !== "enabled") {
    return {
      ok: false,
      reason: `Dependency '${dependency.name}' is not enabled (status: ${depPlan?.status ?? "unknown"}).`,
    };
  }

  if (dependency.range) {
    const version = summary.version ?? "0.0.0";
    if (!semver.valid(version) || !semver.satisfies(version, dependency.range)) {
      return {
        ok: false,
        reason: `Dependency '${dependency.name}' version ${version} does not satisfy required range '${dependency.range}'.`,
      };
    }
  }

  return { ok: true };
}

export function analysePlugins(plugins: LoadedPlugin[], config: PluginConfigMap): PluginAnalysis {
  const registry = createRegistry(plugins);
  const planMap = new Map<string, PluginPlan>();
  const entries: PluginAnalysisEntry[] = [];
  const staleConfigEntries = Object.keys(config).filter((name) => !plugins.some((plugin) => plugin.name === name));

  let order: string[];
  try {
    order = topologicalOrder(plugins);
  } catch (error) {
    console.warn("Failed to compute plugin load order:", error);
    order = plugins.map((plugin) => plugin.name);
  }

  for (const plugin of plugins) {
    planMap.set(plugin.name, {
      name: plugin.name,
      version: plugin.mod.version ?? "0.0.0",
      status: "disabled",
      issues: [],
      resolvedDependencies: [],
    });
  }

  for (const name of order) {
    const plugin = plugins.find((item) => item.name === name);
    const plan = planMap.get(name);
    if (!plugin || !plan) continue;

    const issues: string[] = [];
    const resolvedDependencies: string[] = [];

    if (plugin.config.enabled !== true) {
      entries.push({ info: plugin, plan });
      continue;
    }

    for (const dependency of plugin.mod.deps ?? []) {
      if (!dependency?.name) continue;
      const result = satisfyDependency(dependency, registry, planMap);
      if (!result.ok) {
        issues.push(result.reason ?? `Dependency '${dependency.name}' failed to load.`);
      } else {
        resolvedDependencies.push(dependency.name);
      }
    }

    plan.status = issues.length > 0 ? "skipped" : "enabled";
    plan.issues = issues;
    plan.resolvedDependencies = resolvedDependencies;
    entries.push({ info: plugin, plan });
  }

  return { entries, registry, staleConfigEntries };
}
