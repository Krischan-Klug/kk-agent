import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Express } from "express";
import semver from "semver";
import type {
  ModulePlugin,
  PluginConfigEntry,
  PluginConfigMap,
  PluginLifecycleContext,
  PluginPlan,
  PluginSummary,
} from "./types.js";

const CONFIG_FILE = path.resolve(process.cwd(), "plugins.config.json");
const pluginsDir = fileURLToPath(new URL("./", import.meta.url));
const CORE_PLUGIN_NAME = "core";

const entryCandidates = ["index.ts", "index.js", "index.mjs", "index.cjs"];

interface LoadedPlugin {
  name: string;
  directory: string;
  entry: string;
  mod: ModulePlugin;
  config: PluginConfigEntry;
}

interface PluginAnalysisEntry {
  info: LoadedPlugin;
  plan: PluginPlan;
}

interface PluginAnalysis {
  entries: PluginAnalysisEntry[];
  registry: Record<string, PluginSummary>;
  staleConfigEntries: string[];
}

async function readJSONFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read JSON file '${filePath}':`, error);
    }
    return null;
  }
}

async function writeJSONFile(filePath: string, data: unknown): Promise<void> {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fsPromises.writeFile(filePath, content, "utf8");
}

async function loadConfig(): Promise<PluginConfigMap> {
  const config = await readJSONFile<PluginConfigMap>(CONFIG_FILE);

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
}

async function discoverPluginDirectories(): Promise<string[]> {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const entries = await fsPromises.readdir(pluginsDir, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && name !== "lib")
    .sort((a, b) => a.localeCompare(b));

  return directories;
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

async function importPluginModules(
  directories: string[],
  config: PluginConfigMap
): Promise<{
  plugins: LoadedPlugin[];
  configChanged: boolean;
}> {
  const loaded: LoadedPlugin[] = [];
  let configChanged = false;

  for (const directory of directories) {
    if (!(directory in config)) {
      config[directory] = { enabled: false, settings: {} };
      configChanged = true;
    }

    const entry = findEntryFile(directory);

    if (!entry) {
      console.warn(
        `Skipping plugin '${directory}': no entry file found (expected one of: ${entryCandidates.join(
          ", "
        )}).`
      );
      continue;
    }

    try {
      const moduleUrl = pathToFileURL(entry).href;
      const imported = await import(moduleUrl);
      const plugin: ModulePlugin =
        imported?.default ?? imported?.plugin ?? imported;

      if (!plugin || typeof plugin !== "object") {
        console.warn(
          `Skipping plugin '${directory}': entry file does not export a ModulePlugin.`
        );
        continue;
      }

      if (typeof plugin.init !== "function") {
        console.warn(
          `Skipping plugin '${directory}': the exported plugin must provide an 'init' function.`
        );
        continue;
      }

      const pluginName = plugin.name ?? directory;
      if (loaded.some((item) => item.name === pluginName)) {
        console.warn(
          `Skipping plugin '${directory}': duplicate plugin name '${pluginName}' encountered.`
        );
        continue;
      }

      let entryConfig = config[pluginName] ?? config[directory];
      if (!entryConfig) {
        entryConfig = { enabled: false, settings: {} };
        config[pluginName] = entryConfig;
        configChanged = true;
      } else if (!(pluginName in config)) {
        config[pluginName] = entryConfig;
        configChanged = true;
      }

      if (typeof entryConfig.enabled !== "boolean") {
        entryConfig.enabled = false;
        configChanged = true;
      }

      if (
        !entryConfig.settings ||
        typeof entryConfig.settings !== "object" ||
        Array.isArray(entryConfig.settings)
      ) {
        entryConfig.settings = {};
        configChanged = true;
      }

      const sanitizedConfig: PluginConfigEntry = {
        enabled: entryConfig.enabled,
        settings: { ...entryConfig.settings },
      };

      loaded.push({
        name: pluginName,
        directory,
        entry,
        mod: plugin,
        config: sanitizedConfig,
      });
    } catch (error) {
      console.warn(`Failed to load plugin '${directory}':`, error);
      if (!(directory in config)) {
        config[directory] = { enabled: false, settings: {} };
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
  const pluginsMap = new Map<string, LoadedPlugin>(
    plugins.map((plugin) => [plugin.name, plugin])
  );

  function visit(name: string, stack: string[] = []): void {
    if (visited.has(name)) {
      return;
    }

    if (visiting.has(name)) {
      const cycle = [...stack, name].join(" -> ");
      throw new Error(`Circular plugin dependency detected: ${cycle}`);
    }

    const plugin = pluginsMap.get(name);
    if (!plugin) {
      return;
    }

    visiting.add(name);

    const deps = plugin.mod.deps ?? [];
    for (const dep of deps) {
      if (!dep?.name) {
        continue;
      }
      if (pluginsMap.has(dep.name)) {
        visit(dep.name, [...stack, name]);
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
  dependency: { name: string; range?: string },
  registry: Record<string, PluginSummary>,
  planMap: Map<string, PluginPlan>
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

function cloneSettings(settings: Record<string, unknown> | undefined) {
  if (!settings) {
    return {};
  }
  return { ...settings };
}

function analysePlugins(
  plugins: LoadedPlugin[],
  config: PluginConfigMap
): PluginAnalysis {
  const registry = createRegistry(plugins);
  const planMap = new Map<string, PluginPlan>();
  const entries: PluginAnalysisEntry[] = [];
  const staleConfigEntries = Object.keys(config).filter(
    (name) => !plugins.some((plugin) => plugin.name === name)
  );

  let order: string[] = [];

  try {
    order = topologicalOrder(plugins);
  } catch (error) {
    console.warn("Failed to compute plugin load order:", error);
    order = plugins.map((plugin) => plugin.name);
  }

  // Initialize map with pending plan entries.
  for (const plugin of plugins) {
    planMap.set(plugin.name, {
      name: plugin.name,
      version: plugin.mod.version ?? "0.0.0",
      status: "disabled",
      issues: [],
      resolvedDependencies: [],
    });
  }

  // Evaluate plugins in topological order so dependencies are processed first.
  for (const name of order) {
    const plugin = plugins.find((item) => item.name === name);
    if (!plugin) {
      continue;
    }

    const plan = planMap.get(name);
    if (!plan) {
      continue;
    }

    const issues: string[] = [];
    const resolvedDependencies: string[] = [];
    const deps = plugin.mod.deps ?? [];
    const { enabled = true } = plugin.config;

    if (!enabled) {
      plan.status = "disabled";
      plan.issues = [];
      plan.resolvedDependencies = [];
      entries.push({ info: plugin, plan });
      continue;
    }

    for (const dependency of deps) {
      if (!dependency?.name) {
        continue;
      }

      const result = satisfyDependency(dependency, registry, planMap);
      if (!result.ok) {
        issues.push(result.reason ?? `Dependency '${dependency.name}' failed to load.`);
      } else {
        resolvedDependencies.push(dependency.name);
      }
    }

    if (issues.length) {
      plan.status = "skipped";
      plan.issues = issues;
      plan.resolvedDependencies = resolvedDependencies;
    } else {
      plan.status = "enabled";
      plan.issues = [];
      plan.resolvedDependencies = resolvedDependencies;
    }

    entries.push({ info: plugin, plan });
  }

  return { entries, registry, staleConfigEntries };
}

function buildContext(
  analysis: PluginAnalysis,
  entry: PluginAnalysisEntry
): PluginLifecycleContext {
  const settings = cloneSettings(entry.info.config.settings);
  const resolved: Record<string, PluginSummary> = {};

  for (const dependency of entry.plan.resolvedDependencies) {
    const summary = analysis.registry[dependency];
    if (summary) {
      resolved[dependency] = summary;
    }
  }

  return {
    settings,
    registry: analysis.registry,
    resolvedDependencies: resolved,
  };
}

async function preparePlugins(): Promise<PluginAnalysis> {
  const config = await loadConfig();
  const directories = await discoverPluginDirectories();
  if (!directories.length) {
    return { entries: [], registry: {}, staleConfigEntries: Object.keys(config) };
  }

  const { plugins, configChanged: importChanged } = await importPluginModules(
    directories,
    config
  );
  let configChanged = importChanged;

  const validKeys = new Set<string>([...directories, ...plugins.map((p) => p.name)]);
  for (const key of Object.keys(config)) {
    if (!validKeys.has(key)) {
      delete config[key];
      configChanged = true;
    }
  }

  if (configChanged) {
    try {
      await writeJSONFile(CONFIG_FILE, config);
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

  if (!analysis.entries.length) {
    console.warn("No plugins found in src/plugins.");
    return;
  }

  const coreEntry = analysis.entries.find(
    (entry) => entry.info.name === CORE_PLUGIN_NAME
  );

  if (!coreEntry) {
    throw new Error(
      `Required plugin '${CORE_PLUGIN_NAME}' was not registered during analysis.`
    );
  }

  if (coreEntry.plan.status !== "enabled") {
    const reason =
      coreEntry.plan.status === "disabled"
        ? "it is disabled in plugins.config.json"
        : coreEntry.plan.issues.length
        ? coreEntry.plan.issues.join("; ")
        : "unresolved issues";
    throw new Error(
      `Required plugin '${CORE_PLUGIN_NAME}' must be enabled before the server can start: ${reason}.`
    );
  }

  const enabled: string[] = [];
  const disabled: string[] = [];
  const skipped: PluginAnalysisEntry[] = [];

  if (analysis.staleConfigEntries.length) {
    console.warn(
      "Found configuration entries for unknown plugins:",
      analysis.staleConfigEntries.join(", ")
    );
  }

  for (const entry of analysis.entries) {
    const { plan, info } = entry;
    if (plan.status === "disabled") {
      disabled.push(plan.name);
      continue;
    }
    if (plan.status === "skipped") {
      skipped.push(entry);
      continue;
    }

    const context = buildContext(analysis, entry);

    if (typeof info.mod.beforeInit === "function") {
      await info.mod.beforeInit(app, context);
    }

    await info.mod.init(app, context);

    if (typeof info.mod.afterInit === "function") {
      await info.mod.afterInit(app, context);
    }

    enabled.push(plan.name);
  }

  const total = analysis.entries.length;
  console.log(`Plugins loaded: ${enabled.length} / ${total}`);

  if (enabled.length) {
    const formatted = enabled
      .map((name) => {
        const summary = analysis.registry[name];
        return summary ? `${summary.name}@${summary.version}` : name;
      })
      .join(", ");
    console.log("\x1b[32m%s\x1b[0m", "Plugins enabled:", formatted);
  }

  if (disabled.length) {
    console.log("\x1b[33m%s\x1b[0m", "Plugins disabled:", disabled.join(", "));
  }

  if (skipped.length) {
    const messages = skipped
      .map((entry) => {
        const summary = analysis.registry[entry.info.name];
        const versionInfo = summary ? `@${summary.version}` : "";
        return `${entry.info.name}${versionInfo} -> ${entry.plan.issues.join("; ")}`;
      })
      .join("; ");
    console.log(
      "\x1b[31m%s\x1b[0m",
      "Plugins skipped (dependency issues):",
      messages
    );
  }
}
