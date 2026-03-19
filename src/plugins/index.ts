import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
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
const LEGACY_CONFIG_FILE = path.resolve(process.cwd(), "plugins.json");
const pluginsDir = fileURLToPath(new URL("./", import.meta.url));
const CORE_PLUGIN_NAME = "core";

const DEV_LIFECYCLE = process.env.npm_lifecycle_event === "dev";
const AUTO_SCAFFOLD_ENV = process.env.PLUGIN_AUTO_SCAFFOLD ?? "";
const AUTO_SCAFFOLD_ENABLED =
  DEV_LIFECYCLE ||
  AUTO_SCAFFOLD_ENV.toLowerCase() === "1" ||
  AUTO_SCAFFOLD_ENV.toLowerCase() === "true";

let scaffoldWatcherStarted = false;

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

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function writeFileSafe(target: string, content: string): void {
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, content, "utf8");
  }
}

function ensurePluginDirectoryScaffold(pluginName: string): void {
  if (!AUTO_SCAFFOLD_ENABLED) {
    return;
  }

  const normalized = pluginName.trim();
  if (!normalized) {
    return;
  }

  const pluginPath = path.join(pluginsDir, normalized);
  if (!fs.existsSync(pluginPath) || !fs.statSync(pluginPath).isDirectory()) {
    return;
  }

  const indexPath = path.join(pluginPath, "index.ts");
  const indexJsPath = path.join(pluginPath, "index.js");

  if (fs.existsSync(indexPath) || fs.existsSync(indexJsPath)) {
    return;
  }

  const pascal = toPascalCase(normalized) || "Plugin";
  const pluginConst = `${pascal}Plugin`;
  const routeHandler = `get${pascal}`;
  const serviceFn = `get${pascal}Data`;
  const description = `Auto-generated plugin '${normalized}'.`;

  writeFileSafe(
    indexPath,
    `import type { ModulePlugin } from "../types.js";
import routes from "./routes.js";

export const ${pluginConst}: ModulePlugin = {
  name: "${normalized}",
  version: "0.1.0",
  description: "${description}",
  async init(app, _context) {
    app.use("/${normalized}", routes);
  },
};

export default ${pluginConst};

export * from "./service.js";
export * from "./types.js";
`
  );

  writeFileSafe(
    path.join(pluginPath, "routes.ts"),
    `import { Router } from "express";
import { ${routeHandler} } from "./controller.js";

const router = Router();

router.get("/", ${routeHandler});

export default router;
`
  );

  writeFileSafe(
    path.join(pluginPath, "controller.ts"),
    `import type { Request, Response } from "express";
import { ${serviceFn} } from "./service.js";

export async function ${routeHandler}(_req: Request, res: Response): Promise<Response> {
  const result = await ${serviceFn}();
  return res.json(result);
}
`
  );

  writeFileSafe(
    path.join(pluginPath, "types.ts"),
    `export interface ${pascal}Data {
  message: string;
}
`
  );

  writeFileSafe(
    path.join(pluginPath, "service.ts"),
    `import type { ${pascal}Data } from "./types.js";

export async function ${serviceFn}(): Promise<${pascal}Data> {
  return {
    message: "Hello from ${normalized}!",
  };
}
`
  );
}

function watchPluginsDirectory(): void {
  if (scaffoldWatcherStarted || !AUTO_SCAFFOLD_ENABLED) {
    return;
  }

  scaffoldWatcherStarted = true;

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }

  fs.watch(
    pluginsDir,
    { persistent: false, encoding: "utf8" },
    (_eventType, filename) => {
      const name = (filename ?? "").trim();
      if (!name || name.startsWith(".")) {
        return;
      }
      // Use a slight delay to avoid race conditions where the directory is created after the watch event.
      void delay(50)
        .then(() => ensurePluginDirectoryScaffold(name))
        .catch((error) => {
          console.warn("Failed to scaffold plugin directory:", error);
        });
    }
  );
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
  const config =
    (await readJSONFile<PluginConfigMap>(CONFIG_FILE)) ??
    (await readJSONFile<PluginConfigMap>(LEGACY_CONFIG_FILE));

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

  if (AUTO_SCAFFOLD_ENABLED) {
    directories.forEach((dir) => ensurePluginDirectoryScaffold(dir));
  }

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
  watchPluginsDirectory();

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
